import { prisma } from "@/src/lib/db/config"
import type { OjsJournal } from "../schemas/ojs-schema"

export const JOURNALS_FINGERPRINT_KEY = "ojs_journals_fingerprint"

/**
 * Order-independent fingerprint of the OJS journals table: row count plus the
 * sum of per-row CRC32 checksums over the fields the mirror cares about.
 * Detects additions, deletions, and enable/path edits in a single cheap
 * query — unlike the count-only comparison it replaced, which was blind to
 * deletions and edits. Sum-of-CRC32 avoids GROUP_CONCAT length limits and
 * needs no session variables.
 */
export async function computeOjsJournalsFingerprint(): Promise<string> {
    const { ojsQuery } = await import("./ojs-client")
    const rows = await ojsQuery<{ c: number; s: string | number | null }>(
        `SELECT COUNT(*) AS c,
                COALESCE(SUM(CRC32(CONCAT(journal_id, ':', enabled, ':', path))), 0) AS s
         FROM journals`
    )
    const c = Number(rows?.[0]?.c ?? 0)
    const s = String(rows?.[0]?.s ?? 0)
    return `${c}:${s}`
}

export async function getStoredJournalsFingerprint(): Promise<string | null> {
    const row = await prisma.systemSetting.findUnique({
        where: { setting_key: JOURNALS_FINGERPRINT_KEY },
        select: { setting_value: true },
    })
    return (row?.setting_value as string | null) ?? null
}

async function storeJournalsFingerprint(fingerprint: string): Promise<void> {
    await prisma.systemSetting.upsert({
        where: { setting_key: JOURNALS_FINGERPRINT_KEY },
        create: {
            setting_key: JOURNALS_FINGERPRINT_KEY,
            setting_value: fingerprint,
            description: "OJS journals table fingerprint at last successful sync",
        },
        update: { setting_value: fingerprint },
    })
}

export interface SyncJournalsResult {
    synced: number
    errors: number
    deactivated: string[]
}

/**
 * Synchronize OJS journals into the internal Prisma database.
 * Uses `ojs_id` as the unique linking key between systems.
 *
 * Invoked from the bearer-protected cron endpoint, the
 * `scripts/ojs-sync-cron.ts` standalone script, and the journals-route
 * drift self-heal — never inline on a per-request path.
 *
 * `deactivateMissing` must ONLY be true when `ojsJournals` is the FULL set
 * (fetchFromDatabase(true), including disabled journals); otherwise journals
 * merely disabled in OJS would be wrongly deactivated here. Rows are never
 * hard-deleted — a journal that disappears from OJS is soft-deleted by
 * flipping `status` to "inactive" (zero-data-loss policy).
 */
export async function syncOjsJournals(
    ojsJournals: OjsJournal[],
    opts: { deactivateMissing?: boolean } = {}
): Promise<SyncJournalsResult> {
    let synced = 0
    let errors = 0
    const deactivated: string[] = []
    const syncTime = new Date()
    const baseUrl = process.env.OJS_BASE_URL || ""
    const BATCH_SIZE = 10
    let defaultFieldPromise: Promise<string> | null = null
    const getDefaultField = () => {
        defaultFieldPromise ??= prisma.journalSpecialization.findFirst({
            where: { is_default: true, is_active: true },
            select: { name: true },
        }).then((spec) => {
            if (!spec) throw new Error("No active default journal specialization is configured")
            return spec.name
        })
        return defaultFieldPromise
    }

    for (let i = 0; i < ojsJournals.length; i += BATCH_SIZE) {
        const batch = ojsJournals.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(
            batch.map(async (journal) => {
                const existing = await prisma.journal.findUnique({
                    where: { ojs_id: String(journal.journal_id) },
                })

                // OJS is the source of truth - always use its path if available, otherwise fallback to existing
                const trimmedJournalPath = journal.path?.trim() || ''
                const safeOjsPath = trimmedJournalPath || existing?.ojs_path || null

                if (existing) {
                    return prisma.journal.update({
                        where: { id: existing.id },
                        data: {
                            title: journal.name || journal.path,
                            description: journal.description || null,
                            cover_image_url: journal.thumbnail_url || null,
                            issn: journal.issn?.trim() || null,
                            e_issn: journal.e_issn?.trim() || null,
                            publisher: journal.publisher || null,
                            abbreviation: journal.abbreviation?.trim() || null,
                            editor_in_chief: journal.contact_name || null,
                            website_url: baseUrl && safeOjsPath ? `${baseUrl}/index.php/${safeOjsPath}` : null,
                            ojs_path: safeOjsPath,
                            status: journal.enabled ? "active" : "inactive",
                            aims_and_scope: journal.aims_and_scope ?? null,
                            author_guidelines: journal.author_guidelines ?? null,
                            publication_fee: journal.publication_fee ?? 0,
                            submission_fee: journal.submission_fee ?? 0,
                            last_synced_at: syncTime,
                        },
                    })
                }

                try {
                    return await prisma.journal.create({
                        data: {
                            ojs_id: String(journal.journal_id),
                            title: journal.name || journal.path,
                            description: journal.description || null,
                            field: await getDefaultField(),
                            cover_image_url: journal.thumbnail_url || null,
                            issn: journal.issn?.trim() || null,
                            e_issn: journal.e_issn?.trim() || null,
                            publisher: journal.publisher || null,
                            abbreviation: journal.abbreviation?.trim() || null,
                            editor_in_chief: journal.contact_name || null,
                            website_url: baseUrl && safeOjsPath ? `${baseUrl}/index.php/${safeOjsPath}` : null,
                            ojs_path: safeOjsPath,
                            status: journal.enabled ? "active" : "inactive",
                            aims_and_scope: journal.aims_and_scope ?? null,
                            author_guidelines: journal.author_guidelines ?? null,
                            publication_fee: journal.publication_fee ?? 0,
                            submission_fee: journal.submission_fee ?? 0,
                            last_synced_at: syncTime,
                        },
                    })
                } catch (error) {
                    // Log P2002 Unique constraint failures to help diagnose missing journals
                    if ((error as { code?: string })?.code === "P2002") {
                        console.warn(`[OJS_SYNC] Skipped journal ${journal.journal_id} (${journal.path}) due to unique constraint (P2002) collision (likely duplicate ISSN or path).`)
                        return null
                    }
                    throw error
                }
            })
        )

        for (let j = 0; j < results.length; j++) {
            if (results[j].status === "fulfilled") {
                synced++
            } else {
                errors++
                const journal = batch[j]
                console.error(
                    `[OJS_SYNC] Failed to sync journal ${journal.journal_id} (${journal.path}):`,
                    (results[j] as PromiseRejectedResult).reason
                )
            }
        }
    }

    // Soft-delete journals that vanished from OJS entirely (deleted rows).
    // Requires the full OJS set — see the doc comment above.
    if (opts.deactivateMissing) {
        try {
            const incomingIds = new Set(ojsJournals.map((j) => String(j.journal_id)))
            const mirrored = await prisma.journal.findMany({
                where: { ojs_id: { not: null }, status: { not: "inactive" } },
                select: { id: true, ojs_id: true },
            })
            const missing = mirrored.filter((j) => j.ojs_id && !incomingIds.has(j.ojs_id))
            if (missing.length > 0) {
                await prisma.journal.updateMany({
                    where: { id: { in: missing.map((j) => j.id) } },
                    data: { status: "inactive", last_synced_at: syncTime },
                })
                deactivated.push(...missing.map((j) => j.ojs_id as string))
                console.warn(`[OJS_SYNC] Deactivated ${missing.length} journal(s) no longer present in OJS: ${deactivated.join(", ")}`)
            }
        } catch (error) {
            errors++
            console.error("[OJS_SYNC] Deactivation pass failed:", error)
        }
    }

    // Record the fingerprint of what we just synced so the drift check can
    // cheaply skip when nothing changed. Best-effort — a failure here only
    // means the next drift check triggers one redundant sync.
    if (errors === 0) {
        try {
            await storeJournalsFingerprint(await computeOjsJournalsFingerprint())
        } catch (error) {
            console.warn("[OJS_SYNC] Failed to store journals fingerprint:", error)
        }
    }

    console.log(`[OJS_SYNC] Completed: ${synced} synced, ${errors} errors, ${deactivated.length} deactivated`)
    return { synced, errors, deactivated }
}
