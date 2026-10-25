import { prisma } from "@/src/lib/db/config"
import { setJournalSpecializationInOjsWithAudit } from "@/src/lib/ojs-write-guard"

/**
 * Outbox for writes digitopub pushes to OJS (#234). A change is saved in
 * digitopub first and queued here, so an OJS outage never blocks an admin.
 * Jobs run once right after the save, then from the cron drain
 * (POST /api/ojs/cron/push-sync) with exponential backoff.
 *
 * Status: pending -> running -> succeeded | (pending again) | failed.
 * At most one pending job per (action, target): a newer save replaces the
 * pending payload instead of queueing a second write.
 */

export const JOB_SET_JOURNAL_SPECIALIZATION = "set_journal_specialization"

export const MAX_ATTEMPTS = 10
const BASE_BACKOFF_MS = 60_000
const MAX_BACKOFF_MS = 6 * 60 * 60_000
/** A job left "running" this long (crashed worker) is picked up again. */
const STALE_RUNNING_MS = 10 * 60_000

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

/** Delay before attempt `attempts + 1`: 1 min, 2, 4 … capped at 6 h. */
export function backoffMs(attempts: number): number {
    return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS)
}

/**
 * Queue a write. If a pending job exists for the same action and target, its
 * payload is replaced and it becomes due now (attempts reset, since it is a
 * new value). A job that is already running is left alone; the new job runs
 * after it, so the newest value is written last.
 */
export async function enqueueSyncJob(input: {
    action: string
    targetType: string
    targetId: string
    payload: object
    createdBy?: bigint | null
}): Promise<SyncJob> {
    const payload = JSON.parse(JSON.stringify(input.payload))
    const pending = await prisma.ojsSyncJob.findFirst({
        where: { action: input.action, target_type: input.targetType, target_id: input.targetId, status: "pending" },
        orderBy: { id: "desc" },
    })
    if (pending) {
        return prisma.ojsSyncJob.update({
            where: { id: pending.id },
            data: {
                payload,
                attempts: 0,
                last_error: null,
                next_attempt_at: new Date(),
                created_by: input.createdBy ?? pending.created_by,
            },
        })
    }
    return prisma.ojsSyncJob.create({
        data: {
            action: input.action,
            target_type: input.targetType,
            target_id: input.targetId,
            payload,
            created_by: input.createdBy ?? null,
        },
    })
}

/**
 * Claim and run one job. The claim is a conditional update (pending ->
 * running), so two workers can never run the same job. Returns the job's
 * state after the attempt, or null when another worker claimed it first.
 */
export async function runSyncJob(jobId: bigint): Promise<SyncJob | null> {
    const claimed = await prisma.ojsSyncJob.updateMany({
        where: { id: jobId, status: "pending" },
        data: { status: "running" },
    })
    if (claimed.count !== 1) return null

    const job = await prisma.ojsSyncJob.findUniqueOrThrow({ where: { id: jobId } })
    const handler = handlers[job.action]
    let outcome: HandlerOutcome
    if (!handler) {
        outcome = { success: false, error: `No handler for action ${job.action}`, retryable: false }
    } else {
        try {
            outcome = await handler(job)
        } catch (error) {
            outcome = { success: false, error: error instanceof Error ? error.message : String(error), retryable: true }
        }
    }

    const attempts = job.attempts + 1
    if (outcome.success) {
        return prisma.ojsSyncJob.update({
            where: { id: jobId },
            data: { status: "succeeded", attempts, last_error: null, completed_at: new Date() },
        })
    }
    const giveUp = !outcome.retryable || attempts >= MAX_ATTEMPTS
    return prisma.ojsSyncJob.update({
        where: { id: jobId },
        data: {
            status: giveUp ? "failed" : "pending",
            attempts,
            last_error: (outcome.error ?? "Unknown error").slice(0, 1000),
            next_attempt_at: new Date(Date.now() + backoffMs(attempts)),
            completed_at: giveUp ? new Date() : null,
        },
    })
}

/** Run every due job, oldest first. Used by the cron endpoint. */
export async function drainDueSyncJobs(limit = 25): Promise<{ attempted: number; succeeded: number; failed: number; retrying: number }> {
    await prisma.ojsSyncJob.updateMany({
        where: { status: "running", updated_at: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
        data: { status: "pending" },
    })
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
        else stats.retrying++
    }
    return stats
}

/**
 * Make a failed or waiting job due now ("Retry sync" button). A failed job is
 * reopened with a fresh attempt budget. Returns null when there is nothing to
 * retry for this target.
 */
export async function retryLatestSyncJob(action: string, targetType: string, targetId: string): Promise<SyncJob | null> {
    const latest = await getLatestSyncJob(action, targetType, targetId)
    if (!latest || latest.status === "succeeded" || latest.status === "running") return null
    return prisma.ojsSyncJob.update({
        where: { id: latest.id },
        data: {
            status: "pending",
            next_attempt_at: new Date(),
            ...(latest.status === "failed" ? { attempts: 0, completed_at: null } : {}),
        },
    })
}

export async function getLatestSyncJob(action: string, targetType: string, targetId: string): Promise<SyncJob | null> {
    return prisma.ojsSyncJob.findFirst({
        where: { action, target_type: targetType, target_id: targetId },
        orderBy: { id: "desc" },
    })
}
