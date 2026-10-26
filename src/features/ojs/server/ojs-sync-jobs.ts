import { Prisma } from "@prisma/client"
import { prisma } from "@/src/lib/db/config"
import { setJournalSpecializationInOjsWithAudit } from "@/src/lib/ojs-write-guard"

/**
 * Outbox for writes digitopub pushes to OJS (#234). A change is saved in
 * digitopub first (the job is created in the same transaction), so an OJS
 * outage never blocks an admin. Jobs run once right after the save, then
 * from the cron drain (POST /api/ojs/cron/push-sync) with backoff.
 *
 * Ordering per target ("action:target_type:target_id") is enforced by the
 * database, not by convention:
 *   - pending_key is UNIQUE: at most one pending job. A newer save replaces
 *     its payload (only while it is still pending).
 *   - running_key is UNIQUE: at most one running job. A second claim fails,
 *     so two values can never race each other to OJS.
 * When a running job finishes it runs the target's pending job, so the
 * newest value is always written last, even without the cron.
 *
 * Status: pending -> running -> succeeded | failed (not retryable)
 *                            -> pending (retryable; no attempt cap)
 *                            -> superseded (a newer job took the slot)
 */

export const JOB_SET_JOURNAL_SPECIALIZATION = "set_journal_specialization"

const BASE_BACKOFF_MS = 60_000
const MAX_BACKOFF_MS = 6 * 60 * 60_000
/** A job left "running" this long (crashed worker) is picked up again. */
const STALE_RUNNING_MS = 10 * 60_000

type Db = Prisma.TransactionClient | typeof prisma
type SyncJob = Awaited<ReturnType<typeof prisma.ojsSyncJob.findFirstOrThrow>>

interface HandlerOutcome {
    success: boolean
    error?: string
    retryable: boolean
}

export interface SpecializationPayload {
    ojs_journal_id: number
    value: string | null
}

const handlers: Record<string, (job: SyncJob) => Promise<HandlerOutcome>> = {
    [JOB_SET_JOURNAL_SPECIALIZATION]: async (job) => {
        const payload = job.payload as unknown as SpecializationPayload
        return setJournalSpecializationInOjsWithAudit({
            ojsJournalId: payload.ojs_journal_id,
            value: payload.value,
            actorAdminId: job.created_by,
        })
    },
}

export function slotKey(action: string, targetType: string, targetId: string): string {
    return `${action}:${targetType}:${targetId}`
}

function keyOf(job: { action: string; target_type: string; target_id: string }): string {
    return slotKey(job.action, job.target_type, job.target_id)
}

function isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

/** Delay before attempt `attempts + 1`: 1 min, 2, 4 … capped at 6 h. */
export function backoffMs(attempts: number): number {
    return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS)
}

/**
 * Queue a write. Pass the transaction client when the change it mirrors is
 * written in a transaction, so both commit or neither does. If a pending
 * job exists for the target, its payload is replaced and it is due now.
 */
export async function enqueueSyncJob(
    input: { action: string; targetType: string; targetId: string; payload: object; createdBy?: bigint | null },
    db: Db = prisma
): Promise<SyncJob> {
    const key = slotKey(input.action, input.targetType, input.targetId)
    const payload = JSON.parse(JSON.stringify(input.payload))

    for (let attempt = 0; attempt < 3; attempt++) {
        // A locking current read avoids acting on a stale REPEATABLE READ
        // snapshot while a worker claims or finishes the pending job.
        const pendingRows = await db.$queryRaw<Array<{ id: bigint; created_by: bigint | null }>>`
            SELECT id, created_by FROM ojs_sync_jobs WHERE pending_key = ${key} FOR UPDATE
        `
        const pending = pendingRows[0]
        if (pending) {
            // Conditional: if a worker claimed it meanwhile, its old payload is
            // already on its way, so fall through and queue a new job instead.
            const replaced = await db.ojsSyncJob.updateMany({
                where: { id: pending.id, status: "pending" },
                data: {
                    payload,
                    attempts: 0,
                    last_error: null,
                    next_attempt_at: new Date(),
                    created_by: input.createdBy ?? pending.created_by,
                },
            })
            if (replaced.count === 1) return db.ojsSyncJob.findUniqueOrThrow({ where: { id: pending.id } })
            continue
        }
        try {
            return await db.ojsSyncJob.create({
                data: {
                    action: input.action,
                    target_type: input.targetType,
                    target_id: input.targetId,
                    payload,
                    pending_key: key,
                    created_by: input.createdBy ?? null,
                },
            })
        } catch (error) {
            if (!isUniqueViolation(error)) throw error // another save queued one first: replace it
        }
    }
    throw new Error(`Could not queue OJS sync job for ${key}`)
}

/** pending -> running. False when the job is not pending or the target already has a running job. */
async function claim(job: SyncJob): Promise<boolean> {
    try {
        const claimed = await prisma.ojsSyncJob.updateMany({
            where: { id: job.id, status: "pending" },
            data: { status: "running", pending_key: null, running_key: keyOf(job) },
        })
        return claimed.count === 1
    } catch (error) {
        if (isUniqueViolation(error)) return false
        throw error
    }
}

/**
 * Put a job back in the pending slot, or mark it superseded when a newer job
 * already holds that slot (the newer value is the one that must win).
 */
async function requeue(job: SyncJob, data: Prisma.OjsSyncJobUpdateManyMutationInput, fromStatus: string): Promise<void> {
    try {
        await prisma.ojsSyncJob.updateMany({
            where: { id: job.id, status: fromStatus },
            data: { ...data, status: "pending", running_key: null, pending_key: keyOf(job) },
        })
    } catch (error) {
        if (!isUniqueViolation(error)) throw error
        await prisma.ojsSyncJob.updateMany({
            where: { id: job.id, status: fromStatus },
            data: { ...data, status: "superseded", running_key: null, completed_at: new Date() },
        })
    }
}

/**
 * Claim and run one job, then run the target's next pending job if one is
 * due. Returns this job's state after the attempt, or null when it could not
 * be claimed (not pending, or another job for the target is running; that
 * job will run this one when it finishes).
 */
export async function runSyncJob(jobId: bigint): Promise<SyncJob | null> {
    const job = await prisma.ojsSyncJob.findUnique({ where: { id: jobId } })
    if (!job || !(await claim(job))) return null

    // A pending payload may have been replaced between the first read and the claim.
    const claimedJob = await prisma.ojsSyncJob.findUniqueOrThrow({ where: { id: jobId } })
    const handler = handlers[claimedJob.action]
    let outcome: HandlerOutcome
    if (!handler) {
        outcome = { success: false, error: `No handler for action ${claimedJob.action}`, retryable: false }
    } else {
        try {
            outcome = await handler(claimedJob)
        } catch (error) {
            outcome = { success: false, error: error instanceof Error ? error.message : String(error), retryable: true }
        }
    }

    const attempts = claimedJob.attempts + 1
    const last_error = outcome.success ? null : (outcome.error ?? "Unknown error").slice(0, 1000)
    if (outcome.success || !outcome.retryable) {
        await prisma.ojsSyncJob.updateMany({
            where: { id: jobId, status: "running" },
            data: { status: outcome.success ? "succeeded" : "failed", attempts, last_error, running_key: null, completed_at: new Date() },
        })
    } else {
        await requeue(claimedJob, { attempts, last_error, next_attempt_at: new Date(Date.now() + backoffMs(attempts)) }, "running")
    }

    // A save made while this job ran is waiting in the pending slot; run it now
    // so it lands after this one without waiting for the cron.
    const next = await prisma.ojsSyncJob.findUnique({ where: { pending_key: keyOf(claimedJob) } })
    if (next && next.id !== jobId && next.next_attempt_at <= new Date()) {
        await runSyncJob(next.id)
    }
    return prisma.ojsSyncJob.findUniqueOrThrow({ where: { id: jobId } })
}

/** Run due jobs, oldest first, after recovering jobs a crashed worker left running. Used by the cron. */
export async function drainDueSyncJobs(limit = 10): Promise<{ attempted: number; succeeded: number; failed: number; retrying: number }> {
    const stale = await prisma.ojsSyncJob.findMany({
        where: { status: "running", updated_at: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
    })
    for (const job of stale) await requeue(job, { next_attempt_at: new Date() }, "running")

    const due = await prisma.ojsSyncJob.findMany({
        where: { status: "pending", next_attempt_at: { lte: new Date() } },
        orderBy: { next_attempt_at: "asc" },
        take: limit,
        select: { id: true },
    })

    const stats = { attempted: 0, succeeded: 0, failed: 0, retrying: 0 }
    for (const { id } of due) {
        const result = await runSyncJob(id)
        if (!result) continue
        stats.attempted++
        if (result.status === "succeeded") stats.succeeded++
        else if (result.status === "failed") stats.failed++
        else if (result.status === "pending") stats.retrying++
    }
    return stats
}

/**
 * "Retry sync": make the target's job due now and run it. A failed job is
 * reopened (or superseded if a newer job is already pending).
 */
export async function retryLatestSyncJob(action: string, targetType: string, targetId: string): Promise<SyncJob | null> {
    const latest = await getLatestSyncJob(action, targetType, targetId)
    if (!latest || latest.status === "succeeded" || latest.status === "running") return latest
    if (latest.status === "failed") {
        await requeue(latest, { attempts: 0, next_attempt_at: new Date(), completed_at: null }, "failed")
    } else {
        await prisma.ojsSyncJob.updateMany({ where: { id: latest.id, status: "pending" }, data: { next_attempt_at: new Date() } })
    }
    const pending = await prisma.ojsSyncJob.findUnique({ where: { pending_key: slotKey(action, targetType, targetId) } })
    if (pending) await runSyncJob(pending.id)
    return getLatestSyncJob(action, targetType, targetId)
}

/** The target's most recent job, ignoring superseded ones. */
export async function getLatestSyncJob(action: string, targetType: string, targetId: string): Promise<SyncJob | null> {
    return prisma.ojsSyncJob.findFirst({
        where: { action, target_type: targetType, target_id: targetId, status: { not: "superseded" } },
        orderBy: { id: "desc" },
    })
}

/** Latest non-superseded job per target for one action (one row per target, not the whole history). */
export async function getLatestSyncJobsByTarget(action: string, targetType: string): Promise<SyncJob[]> {
    const latest = await prisma.ojsSyncJob.groupBy({
        by: ["target_id"],
        where: { action, target_type: targetType, status: { not: "superseded" } },
        _max: { id: true },
    })
    const ids = latest.map((row) => row._max.id).filter((id): id is bigint => id !== null)
    if (ids.length === 0) return []
    return prisma.ojsSyncJob.findMany({ where: { id: { in: ids } } })
}
