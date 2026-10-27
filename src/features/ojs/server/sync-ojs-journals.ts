import { prisma } from "@/src/lib/db/config"
import { withDeadlockRetry } from "@/src/lib/db/deadlock-retry"
import type { OjsJournal } from "../schemas/ojs-schema"
import { chooseCoverUrl, type CoverChoice } from "./cover-check"

export const JOURNALS_FINGERPRINT_KEY = "ojs_journals_fingerprint"

/**
 * Versioned, order-independent fingerprint of the journal rows and every
 * setting copied into the mirror. Sum-of-CRC32 avoids GROUP_CONCAT length
 * limits and needs no session variables.
 */
export async function computeOjsJournalsFingerprint(): Promise<string> {
    const { ojsQuery } = await import("./ojs-client")
    const rows = await ojsQuery<{
        scope: "journals" | "settings"
        c: number
        s: string | number | null
    }>(
        `SELECT scope, c, s FROM (
            SELECT 'journals' AS scope,
                   COUNT(*) AS c,
                   COALESCE(SUM(CRC32(CONCAT(journal_id, ':', enabled, ':', path, ':', primary_locale))), 0) AS s
            FROM journals
            UNION ALL
            SELECT 'settings' AS scope,
                   COUNT(*) AS c,
                   COALESCE(SUM(CRC32(CONCAT(journal_id, ':', setting_name, ':', locale, ':', setting_value))), 0) AS s
            FROM journal_settings
            WHERE setting_name IN (
                'name', 'description', 'homepageImage', 'journalThumbnail',
                'printIssn', 'onlineIssn', 'publisherInstitution', 'abbreviation',
                'contactName', 'aimsAndScope', 'authorGuidelines',
                'publicationFee', 'submissionFee'
            )
        ) AS fingerprint_parts`
    )
    const journal = rows.find((row) => row.scope === "journals")
    const settings = rows.find((row) => row.scope === "settings")
    if (!journal || !settings) {
        throw new Error("Incomplete OJS journal fingerprint result")
    }
    return [
        "v2",
        Number(journal.c),
        String(journal.s ?? 0),
        Number(settings.c),
        String(settings.s ?? 0),
    ].join(":")
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
            description: "OJS journal and mirrored-setting fingerprint at last successful sync",
        },
        update: { setting_value: fingerprint },
    })
}

export interface SyncCoversReport {
    checked: number
    ok: number
    /** OJS paths whose stored cover does not load (404/410/HTML). */
    broken: string[]
    /** OJS paths where a broken new URL was refused and the working one kept. */
    kept_old: string[]
}

export interface SyncJournalsResult {
    synced: number
    errors: number
    deactivated: string[]
    covers: SyncCoversReport
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
    opts: { deactivateMissing?: boolean; fingerprint?: string } = {}
): Promise<SyncJournalsResult> {
    const fingerprint = opts.fingerprint ?? await computeOjsJournalsFingerprint()
    let synced = 0
    let errors = 0
    const deactivated: string[] = []
    const covers: SyncCoversReport = { checked: 0, ok: 0, broken: [], kept_old: [] }
    const noteCover = (path: string, choice: CoverChoice) => {
        covers.checked++
        if (choice.probe === "ok") covers.ok++
        if (choice.probe === "broken") covers.broken.push(path)
        if (choice.decision === "kept_old") {
            covers.kept_old.push(path)
            console.warn(`[OJS_SYNC] Kept the working cover for ${path}: the new OJS cover URL does not load`)
        }
    }
    const syncTime = new Date()
    const baseUrl = process.env.OJS_BASE_URL || ""
    const BATCH_SIZE = 10

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

                // #239: never replace a working cover with one that does not load.
                const cover = await chooseCoverUrl(existing?.cover_image_url ?? null, journal.thumbnail_url || null)
                noteCover(safeOjsPath ?? String(journal.journal_id), cover)

                if (existing) {
                    return prisma.journal.update({
                        where: { id: existing.id },
                        data: {
                            title: journal.name || journal.path,
                            description: journal.description || null,
                            cover_image_url: cover.url,
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
                    return await withDeadlockRetry(async (tx) => {
                        const defaults = await tx.$queryRaw<Array<{ name: string }>>`
                            SELECT name FROM journal_specializations
                            WHERE is_default = TRUE AND is_active = TRUE
                            FOR UPDATE
                        `
                        const defaultSpec = defaults[0]
                        if (!defaultSpec) throw new Error("No active default journal specialization is configured")

                        return tx.journal.create({
                            data: {
                                ojs_id: String(journal.journal_id),
                                title: journal.name || journal.path,
                                description: journal.description || null,
                                field: defaultSpec.name,
                                cover_image_url: cover.url,
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
            await storeJournalsFingerprint(fingerprint)
        } catch (error) {
            console.warn("[OJS_SYNC] Failed to store journals fingerprint:", error)
        }
    }

    if (covers.broken.length > 0) console.warn(`[OJS_SYNC] ${covers.broken.length} journal cover(s) do not load: ${covers.broken.join(", ")}`)
    console.log(`[OJS_SYNC] Completed: ${synced} synced, ${errors} errors, ${deactivated.length} deactivated, covers ${covers.ok}/${covers.checked} ok`)
    return { synced, errors, deactivated, covers }
}
