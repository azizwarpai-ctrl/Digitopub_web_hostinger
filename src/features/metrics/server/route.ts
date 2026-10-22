import { Hono } from "hono"
import { ojsQuery, isOjsConfigured } from "@/src/features/ojs/server/ojs-client"
import { prisma } from "@/src/lib/db/config"
import { metricsEventsRouter } from "@/src/server/routes/metrics-events"
import { cronEndpoint } from "@/src/lib/cron-endpoint"
import {
    aggregateDailyMetrics,
    aggregateMonthlyMetrics,
    updateUserMetrics,
    retentionCleanup,
} from "./jobs"

const AUTHOR_ROLE_ID = 65536 // PKP\security\Role::ROLE_ID_AUTHOR

const app = new Hono()

// UIET-P1: ingestion endpoints for view/download/citation events, scoped
// under /api/metrics/events/* so they never collide with the existing
// GET /api/metrics/ site-stats endpoint.
app.route("/events", metricsEventsRouter)

// ─── Cron endpoints ──────────────────────────────────────────────────
// The production host has no crontab (see docs/ops/discovery-2026-08.md),
// so the metrics jobs are triggered over HTTP by hPanel cron / an external
// scheduler, wrapped by cronEndpoint() (src/lib/cron-endpoint.ts): Bearer
// CRON_SECRET, a self-expiring DB lock, and a SyncRun ledger row.

// Soft wall-clock budget below typical shared-hosting request timeouts; a
// job that exceeds it reports partial (207) and resumes on the next tick.
const CRON_SOFT_DEADLINE_MS = 50 * 1000

app.post("/cron/daily", cronEndpoint("metrics_daily_aggregation", async (c) => {
    const day = c.req.query("day")
    const result = await aggregateDailyMetrics(day || undefined)
    return { partial: false, stats: { ...result } }
}))

app.post("/cron/monthly", cronEndpoint("metrics_monthly_aggregation", async (c) => {
    const monthParam = c.req.query("month")
    let target: { year: number; month: number } | undefined
    if (monthParam) {
        const [y, m] = monthParam.split("-").map(Number)
        target = { year: y, month: m }
    }
    const result = await aggregateMonthlyMetrics(target)
    return { partial: false, stats: { ...result } }
}))

app.post("/cron/user", cronEndpoint("user_metrics_update", async () => {
    const result = await updateUserMetrics()
    return { partial: false, stats: { ...result } }
}))

app.post("/cron/retention", cronEndpoint("retention_cleanup", async () => {
    const result = await retentionCleanup({ deadlineMs: CRON_SOFT_DEADLINE_MS })
    return { partial: !result.completed, stats: { ...result } }
}))

app.get("/", async (c) => {
    try {
        // If using direct MySQL DB
        if (isOjsConfigured()) {
            // Pull the set of journal IDs DigitoPub actually displays from Prisma
            // (single source of truth). OJS's `enabled` flag only hides a
            // journal from OJS's own storefront — DigitoPub keeps surfacing it,
            // so metrics must be scoped to every synced journal, not just the
            // OJS-enabled subset.
            const syncedJournalIds = (
                await prisma.journal.findMany({
                    where: { ojs_id: { not: null } },
                    select: { ojs_id: true },
                })
            )
                .map((j) => j.ojs_id)
                .filter((id): id is string => Boolean(id))

            // Cast to unsigned integers — OJS journal_id is an INT, and Prisma
            // stores ojs_id as a string for flexibility.
            const syncedIntIds = syncedJournalIds
                .map((id) => Number(id))
                .filter((n) => Number.isFinite(n) && n > 0)

            const journalsCount = await prisma.journal.count()

            // Build a reusable IN-clause for OJS side filtering. When no
            // journals are synced yet we short-circuit the dependent queries
            // rather than emitting an invalid `IN ()` SQL expression.
            const hasSynced = syncedIntIds.length > 0
            const journalInClause = hasSynced ? syncedIntIds.join(",") : ""

            const results = await Promise.allSettled([
                // Count published submissions in every DigitoPub-visible journal
                hasSynced
                    ? ojsQuery<{ count: number }>(
                        `SELECT COUNT(*) as count
                         FROM submissions s
                         WHERE s.status = 3
                           AND s.context_id IN (${journalInClause})`
                    )
                    : Promise.resolve([{ count: 0 }] as { count: number }[]),
                // Count unique researchers (distinct author emails) across all visible journals
                hasSynced
                    ? ojsQuery<{ count: number }>(
                        `SELECT COUNT(DISTINCT a.email) as count
                         FROM authors a
                         INNER JOIN publications p ON p.publication_id = a.publication_id
                         INNER JOIN submissions s ON s.submission_id = p.submission_id AND s.status = 3
                         WHERE s.context_id IN (${journalInClause})`
                    )
                    : Promise.resolve([{ count: 0 }] as { count: number }[]),
                // Count countries from geographic metrics (real visitor/access data)
                ojsQuery<{ count: number }>(
                    "SELECT COUNT(DISTINCT country) as count FROM metrics_submission_geo_monthly WHERE country != '' AND country IS NOT NULL"
                ),
                // Fallback: count countries from users with the Author role (role_id = AUTHOR_ROLE_ID)
                ojsQuery<{ count: number }>(
                    `SELECT COUNT(DISTINCT u.country) as count
                     FROM users u
                     INNER JOIN user_user_groups uug ON uug.user_id = u.user_id
                     INNER JOIN user_groups ug ON ug.user_group_id = uug.user_group_id AND ug.role_id = ${AUTHOR_ROLE_ID}
                     WHERE u.country IS NOT NULL AND u.country != '' AND u.disabled = 0`
                ),
                // Fallback: count distinct countries from journal settings across visible journals
                hasSynced
                    ? ojsQuery<{ count: number }>(
                        `SELECT COUNT(DISTINCT js.setting_value) as count
                         FROM journal_settings js
                         WHERE js.journal_id IN (${journalInClause})
                           AND js.setting_name = 'country'
                           AND js.setting_value IS NOT NULL AND js.setting_value != ''`
                    )
                    : Promise.resolve([{ count: 0 }] as { count: number }[]),
            ])

            interface CountRow { count: number }
            // Safely extract results
            const getCount = (res: PromiseSettledResult<CountRow[]>): number => {
                if (res.status === "fulfilled" && res.value && res.value.length > 0) {
                    return res.value[0].count || 0
                }
                return 0
            }

            const articlesCount = getCount(results[0])
            const researchersCount = getCount(results[1])
            const geoCountriesCount = getCount(results[2])
            const userCountriesCount = getCount(results[3])
            const journalCountriesCount = getCount(results[4])

            const queryErrors = results
                .filter((r) => r.status === "rejected")
                .map((r) => (r as PromiseRejectedResult).reason?.message || String((r as PromiseRejectedResult).reason))

            // Cascading fallback: geo metrics → user countries → journal settings → active journals
            let countriesCount = 0
            if (geoCountriesCount > 0) {
                countriesCount = geoCountriesCount
            } else if (userCountriesCount > 0) {
                countriesCount = userCountriesCount
            } else if (journalCountriesCount > 0) {
                countriesCount = journalCountriesCount
            } else {
                // Minimum floor: assume at least 1 country per synced journal (visible to users)
                countriesCount = journalsCount
            }

            return c.json({
                success: true,
                data: {
                    activeJournals: journalsCount, // Counts all journals synced to DigitoPub (visible to users)
                    publishedArticles: articlesCount,
                    researchers: researchersCount,
                    countriesEstimated: countriesCount,
                    debugErrors: queryErrors.length > 0 ? queryErrors : undefined,
                }
            })
        }

        // Fallback to internal Prisma DB
        const [totalJournals, totalArticles, totalResearchers] = await Promise.all([
            prisma.journal.count({ where: { status: "active" } }),
            prisma.submission.count({ where: { status: "published" } }),
            prisma.adminUser.count({ where: { role: { in: ["author", "reviewer", "editor"] } } }),
        ])

        return c.json({
            success: true,
            data: {
                activeJournals: totalJournals,
                publishedArticles: totalArticles,
                researchers: totalResearchers,
                countriesEstimated: 0,
            }
        })
    } catch (error) {
        console.error("[METRICS_GET]", error)
        const errorMessage = error instanceof Error ? error.message : "Internal Error"
        return c.json({ success: false, error: errorMessage }, 500)
    }
})

export { app as metricsRouter }
