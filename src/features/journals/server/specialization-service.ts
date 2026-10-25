import { prisma } from "@/src/lib/db/config"
import {
  JOB_SET_JOURNAL_SPECIALIZATION,
  enqueueSyncJob,
  getLatestSyncJob,
  retryLatestSyncJob,
  runSyncJob,
} from "@/src/features/ojs/server/ojs-sync-jobs"
import type {
  SpecializationItem,
  SpecializationSyncStatus,
  SpecializationUpdate,
} from "@/src/features/journals/schemas/specialization-schema"

/**
 * Journal specialization (#234). Journal.field holds the chosen name; the
 * names come from journal_specializations. Every change to a linked journal
 * (one with an ojs_id) is queued for OJS and attempted once immediately.
 */

export class SpecializationError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message)
  }
}

const TARGET = "journal"

export async function listSpecializations(opts: { includeInactive: boolean }): Promise<SpecializationItem[]> {
  const [specs, usage] = await Promise.all([
    prisma.journalSpecialization.findMany({
      where: opts.includeInactive ? {} : { is_active: true },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    }),
    prisma.journal.groupBy({ by: ["field"], _count: { _all: true } }),
  ])
  const counts = new Map(usage.map((u) => [u.field.toLowerCase(), u._count._all]))
  return specs.map((s) => ({
    id: s.id.toString(),
    name: s.name,
    sort_order: s.sort_order,
    is_active: s.is_active,
    usage_count: counts.get(s.name.toLowerCase()) ?? 0,
  }))
}

export async function createSpecialization(input: { name: string; sort_order?: number }) {
  const existing = await findByName(input.name)
  if (existing) throw new SpecializationError(`"${existing.name}" already exists`, 409)
  return prisma.journalSpecialization.create({
    data: { name: input.name, sort_order: input.sort_order ?? 500 },
  })
}

/**
 * Rename, reorder or retire a specialization. A rename rewrites Journal.field
 * on every journal that uses the old name and queues an OJS sync for each
 * linked one. Retiring keeps existing journals as they are; the name just
 * can no longer be chosen.
 */
export async function updateSpecialization(id: bigint, input: SpecializationUpdate, actorAdminId: bigint | null) {
  const spec = await prisma.journalSpecialization.findUnique({ where: { id } })
  if (!spec) throw new SpecializationError("Specialization not found", 404)

  const renamed = input.name !== undefined && input.name !== spec.name
  if (renamed) {
    const clash = await findByName(input.name!)
    if (clash && clash.id !== id) throw new SpecializationError(`"${clash.name}" already exists`, 409)
  }

  const affected = renamed
    ? await prisma.journal.findMany({ where: { field: spec.name }, select: { id: true, ojs_id: true } })
    : []

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.journalSpecialization.update({
      where: { id },
      data: { name: input.name, sort_order: input.sort_order, is_active: input.is_active },
    })
    if (renamed) {
      await tx.journal.updateMany({ where: { field: spec.name }, data: { field: input.name! } })
    }
    return row
  })

  for (const journal of affected) {
    if (journal.ojs_id) await queueAndAttempt(journal.id, journal.ojs_id, updated.name, actorAdminId)
  }
  return { specialization: updated, journalsUpdated: affected.length }
}

/** Set a journal's specialization from the active list, then sync it to OJS. */
export async function setJournalSpecialization(journalId: bigint, name: string, actorAdminId: bigint | null) {
  const journal = await prisma.journal.findUnique({ where: { id: journalId }, select: { id: true, ojs_id: true } })
  if (!journal) throw new SpecializationError("Journal not found", 404)

  const spec = await findByName(name)
  if (!spec || !spec.is_active) throw new SpecializationError(`"${name}" is not an active specialization`, 400)

  await prisma.journal.update({ where: { id: journalId }, data: { field: spec.name } })

  const sync = journal.ojs_id
    ? await queueAndAttempt(journal.id, journal.ojs_id, spec.name, actorAdminId)
    : notLinked()
  return { journal_id: journalId.toString(), field: spec.name, sync }
}

export async function retryJournalSpecializationSync(journalId: bigint) {
  const journal = await prisma.journal.findUnique({ where: { id: journalId }, select: { id: true, ojs_id: true } })
  if (!journal) throw new SpecializationError("Journal not found", 404)
  if (!journal.ojs_id) return notLinked()

  const job = await retryLatestSyncJob(JOB_SET_JOURNAL_SPECIALIZATION, TARGET, journalId.toString())
  if (job) await runSyncJob(job.id)
  return getJournalSyncStatus(journalId, journal.ojs_id)
}

export async function getJournalSyncStatus(journalId: bigint, ojsId: string | null): Promise<SpecializationSyncStatus> {
  if (!ojsId) return notLinked()
  return toStatus(await getLatestSyncJob(JOB_SET_JOURNAL_SPECIALIZATION, TARGET, journalId.toString()))
}

/** Latest sync state for every journal that has one, keyed by journal id. */
export async function getAllJournalSyncStatuses(): Promise<Record<string, SpecializationSyncStatus>> {
  const jobs = await prisma.ojsSyncJob.findMany({
    where: { action: JOB_SET_JOURNAL_SPECIALIZATION, target_type: TARGET },
    orderBy: { id: "desc" },
  })
  const result: Record<string, SpecializationSyncStatus> = {}
  for (const job of jobs) {
    if (!(job.target_id in result)) result[job.target_id] = toStatus(job)
  }
  return result
}

async function queueAndAttempt(journalId: bigint, ojsId: string, value: string, actorAdminId: bigint | null) {
  const job = await enqueueSyncJob({
    action: JOB_SET_JOURNAL_SPECIALIZATION,
    targetType: TARGET,
    targetId: journalId.toString(),
    payload: { ojs_journal_id: Number(ojsId), value },
    createdBy: actorAdminId,
  })
  // First attempt right away so the admin usually sees "synced" at once; on
  // failure the job stays queued for the cron drain.
  const after = await runSyncJob(job.id)
  return toStatus(after ?? job)
}

async function findByName(name: string) {
  // The column collation is case-insensitive, so this also catches
  // "dentistry" vs "Dentistry".
  return prisma.journalSpecialization.findFirst({ where: { name: name.trim() } })
}

type JobLike = {
  status: string
  attempts: number
  last_error: string | null
  next_attempt_at: Date
  completed_at: Date | null
  updated_at: Date
} | null

function toStatus(job: JobLike): SpecializationSyncStatus {
  if (!job) return { state: "never", attempts: 0, last_error: null, next_attempt_at: null, completed_at: null, updated_at: null }
  const state = job.status === "succeeded" ? "synced" : job.status === "failed" ? "failed" : "pending"
  return {
    state,
    attempts: job.attempts,
    last_error: job.last_error,
    next_attempt_at: state === "pending" ? job.next_attempt_at.toISOString() : null,
    completed_at: job.completed_at?.toISOString() ?? null,
    updated_at: job.updated_at.toISOString(),
  }
}

function notLinked(): SpecializationSyncStatus {
  return { state: "not_linked", attempts: 0, last_error: null, next_attempt_at: null, completed_at: null, updated_at: null }
}
