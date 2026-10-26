/**
 * Audited single-path writer for the OJS database.
 *
 * digitopub writes to OJS ONLY through the functions in this file, and EVERY
 * write is audited in audit_ojs_writes (success or failure), audit row first:
 *   - writeOrcidToOjsWithAudit: ORCID backfill (UIET-P1), only when
 *     ENABLE_ORCID_OJS_BACKFILL=true.
 *   - setJournalSpecializationInOjsWithAudit: journal specialization (#234),
 *     through the OJS user bridge. Called by the OJS sync queue.
 */

import { randomUUID } from "node:crypto"
import { prisma } from "./db/config"
import { getOjsConnection, postToUserBridge } from "@/src/features/ojs/server/ojs-client"
import { getFlagsEnv } from "./env"

export interface WriteOrcidInput {
  orcid: string
  ojsUserId: number | bigint
  /** Caller-supplied request id (defaults to a fresh UUID). */
  requestId?: string
}

export interface WriteOrcidResult {
  success: boolean
  /** Was a real write attempted? Returns false when flag is OFF or row already existed. */
  attempted: boolean
  auditId: bigint | null
  error?: string
}

export function isBackfillEnabled(): boolean {
  return getFlagsEnv().ENABLE_ORCID_OJS_BACKFILL
}

/**
 * Write ORCID into OJS user_settings, audit-first.
 *
 * Order of operations:
 *   1. INSERT audit_ojs_writes with success=NULL (planned).
 *   2. INSERT INTO user_settings on OJS.
 *   3. UPDATE audit_ojs_writes SET success=true (or success=false on failure).
 *
 * Idempotency: if the OJS row already exists, we still write an audit row
 * marked success=true but `attempted=false`.
 */
export async function writeOrcidToOjsWithAudit(
  input: WriteOrcidInput
): Promise<WriteOrcidResult> {
  if (!isBackfillEnabled()) {
    return { success: false, attempted: false, auditId: null }
  }

  const requestId = input.requestId ?? randomUUID()
  const ojsUserIdBigInt =
    typeof input.ojsUserId === "bigint" ? input.ojsUserId : BigInt(input.ojsUserId)
  const columnSet = `setting_name='orcid'; setting_value='${input.orcid}'`

  // 1) Plan the write — audit row with success=NULL.
  const auditRow = await prisma.auditOjsWrite.create({
    data: {
      request_id: requestId,
      orcid: input.orcid,
      ojs_user_id: ojsUserIdBigInt,
      ojs_table: "user_settings",
      ojs_column_set: columnSet,
      reason: "orcid_backfill",
    },
    select: { id: true },
  })

  let conn: Awaited<ReturnType<typeof getOjsConnection>> | null = null
  try {
    conn = await getOjsConnection()

    // Pre-check: if an ORCID setting row already exists for this user, skip.
    const [existing] = (await conn.query(
      "SELECT user_id FROM user_settings WHERE user_id = ? AND setting_name = 'orcid' LIMIT 1",
      [Number(ojsUserIdBigInt)]
    )) as [Array<{ user_id: number }>, unknown]

    if (Array.isArray(existing) && existing.length > 0) {
      await prisma.auditOjsWrite.update({
        where: { id: auditRow.id },
        data: {
          success: true,
          resolved_at: new Date(),
          error: "row_exists_skipped",
        },
      })
      return { success: true, attempted: false, auditId: auditRow.id }
    }

    await conn.query(
      "INSERT INTO user_settings (user_id, locale, setting_name, setting_value) VALUES (?, '', 'orcid', ?)",
      [Number(ojsUserIdBigInt), input.orcid]
    )

    await prisma.auditOjsWrite.update({
      where: { id: auditRow.id },
      data: { success: true, resolved_at: new Date() },
    })
    return { success: true, attempted: true, auditId: auditRow.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ojs-write-guard] OJS write failed for orcid=${input.orcid}: ${message}`)
    try {
      await prisma.auditOjsWrite.update({
        where: { id: auditRow.id },
        data: { success: false, resolved_at: new Date(), error: message.slice(0, 1000) },
      })
    } catch {
      /* swallow — we already logged */
    }
    return { success: false, attempted: true, auditId: auditRow.id, error: message }
  } finally {
    if (conn) {
      try {
        conn.release()
      } catch {
        /* ignore */
      }
    }
  }
}

export interface SetJournalSpecializationInput {
  /** OJS journals.journal_id (digitopub Journal.ojs_id). */
  ojsJournalId: number
  /** New specialization; null or "" removes the OJS setting. */
  value: string | null
  actorAdminId?: bigint | null
  requestId?: string
}

export interface SetJournalSpecializationResult {
  success: boolean
  auditId: bigint
  before?: string | null
  after?: string | null
  error?: string
  /** False when retrying the same request cannot succeed (e.g. 400/404). */
  retryable: boolean
}

/**
 * Store a journal's specialization in OJS (journal setting
 * `digitopubSpecialization`) via the bridge action set_journal_specialization.
 *
 *   1. INSERT audit_ojs_writes (success=NULL, after_value = intended value).
 *   2. POST to the OJS user bridge, once (the sync queue owns retries).
 *   3. UPDATE the audit row with the outcome and the value OJS held before.
 */
export async function setJournalSpecializationInOjsWithAudit(
  input: SetJournalSpecializationInput
): Promise<SetJournalSpecializationResult> {
  const value = input.value?.trim() || null
  const auditRow = await prisma.auditOjsWrite.create({
    data: {
      request_id: input.requestId ?? randomUUID(),
      ojs_table: "journal_settings",
      ojs_column_set: "setting_name='digitopubSpecialization'; locale=''",
      reason: "journal_specialization",
      target_type: "journal",
      target_id: String(input.ojsJournalId),
      actor_admin_id: input.actorAdminId ?? null,
      after_value: value,
    },
    select: { id: true },
  })

  const result = await postToUserBridge({
    action: "set_journal_specialization",
    journal_id: input.ojsJournalId,
    value,
  })

  if (result.ok) {
    const before = typeof result.data.before === "string" ? result.data.before : null
    const after = typeof result.data.after === "string" ? result.data.after : null
    await recordOutcome(auditRow.id, { success: true, resolved_at: new Date(), before_value: before, after_value: after })
    return { success: true, auditId: auditRow.id, before, after, retryable: false }
  }

  const error = result.status ? `HTTP ${result.status}: ${result.error}` : result.error
  console.error(`[ojs-write-guard] journal specialization write failed for ojs journal ${input.ojsJournalId}: ${error}`)
  await recordOutcome(auditRow.id, { success: false, resolved_at: new Date(), error: error.slice(0, 1000) })
  return { success: false, auditId: auditRow.id, error, retryable: result.retryable }
}

/** Resolve an audit row; callers must not report success if this fails. */
async function recordOutcome(
  id: bigint,
  data: { success: boolean; resolved_at: Date; error?: string; before_value?: string | null; after_value?: string | null }
): Promise<void> {
  await prisma.auditOjsWrite.update({ where: { id }, data })
}
