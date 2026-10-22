import { prisma } from "@/src/lib/db/config"
import { PENDING_SUBSCRIBER_RETENTION_DAYS } from "@/src/features/notifications/server/config"

/**
 * Core logic for the recurring metrics jobs, extracted from the `scripts/`
 * CLI entry points so the same code runs via both `bun run scripts/…` and
 * the Bearer-protected `/api/metrics/cron/*` endpoints (the host has no
 * crontab; HTTP is the only schedulable trigger in production — see
 * docs/ops/cron-schedule.md).
 *
 * All jobs are idempotent: daily/monthly upsert against composite unique
 * keys, user metrics recompute lifetime totals, retention deletes are
 * naturally re-runnable.
 */

interface ArticleAggRow {
    article_id: bigint
    journal_id: bigint
    views: bigint
    unique_views: bigint
    downloads: bigint
    unique_downloads: bigint
    citations: bigint
}

export function previousUtcDay(): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
}

export function previousUtcMonth(): { year: number; month: number } {
    const now = new Date()
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    return { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1 }
}

/**
 * Aggregates one UTC day of `user_event` rows into `metrics_article_daily`
 * (one row per article/day/source='digitopub'; idempotent via the UNIQUE
 * index on (article_id, day, source)).
 */
export async function aggregateDailyMetrics(day: string = previousUtcDay()): Promise<{ day: string; upserted: number }> {
    const start = new Date(`${day}T00:00:00.000Z`)
    if (Number.isNaN(start.getTime())) {
        throw new Error(`Invalid day: ${day} (expected YYYY-MM-DD)`)
    }
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

    // Raw aggregation query. GROUP BY (article_id, journal_id) so the daily
    // row carries both. unique_* counts use DISTINCT dedup_key.
    const rows = await prisma.$queryRaw<ArticleAggRow[]>`
        SELECT
            article_id,
            journal_id,
            SUM(CASE WHEN event_type='view' THEN 1 ELSE 0 END) AS views,
            COUNT(DISTINCT CASE WHEN event_type='view' THEN dedup_key ELSE NULL END) AS unique_views,
            SUM(CASE WHEN event_type='download' THEN 1 ELSE 0 END) AS downloads,
            COUNT(DISTINCT CASE WHEN event_type='download' THEN dedup_key ELSE NULL END) AS unique_downloads,
            SUM(CASE WHEN event_type='citation_export' THEN 1 ELSE 0 END) AS citations
         FROM user_event
         WHERE created_at >= ${start} AND created_at < ${end}
         GROUP BY article_id, journal_id`

    const mapped = rows.map((r) => ({
        article_id: r.article_id,
        journal_id: r.journal_id,
        day,
        views: Number(r.views ?? 0),
        unique_views: Number(r.unique_views ?? 0),
        downloads: Number(r.downloads ?? 0),
        unique_downloads: Number(r.unique_downloads ?? 0),
        citations: Number(r.citations ?? 0),
        source: "digitopub" as const,
    }))
    await prisma.metricsArticleDaily.createMany({ data: mapped, skipDuplicates: true })
    const updates = mapped.map((r) =>
        prisma.metricsArticleDaily.updateMany({
            where: {
                article_id: r.article_id,
                day,
                source: "digitopub" as const,
            },
            data: {
                journal_id: r.journal_id,
                views: r.views,
                unique_views: r.unique_views,
                downloads: r.downloads,
                unique_downloads: r.unique_downloads,
                citations: r.citations,
                computed_at: new Date(),
            },
        })
    )
    if (updates.length > 0) await prisma.$transaction(updates)
    return { day, upserted: mapped.length }
}

/**
 * Rolls `metrics_article_daily` up into `metrics_article_monthly` for the
 * target month (default: previous UTC month).
 */
export async function aggregateMonthlyMetrics(
    target: { year: number; month: number } = previousUtcMonth()
): Promise<{ year: number; month: number; upserted: number }> {
    const { year, month } = target
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error(`Invalid month: ${year}-${month} (expected YYYY-MM)`)
    }
    const mm = String(month).padStart(2, "0")
    const dayPrefix = `${year}-${mm}-`

    const rows = await prisma.$queryRaw<ArticleAggRow[]>`
        SELECT
            article_id,
            journal_id,
            SUM(views) AS views,
            SUM(unique_views) AS unique_views,
            SUM(downloads) AS downloads,
            SUM(unique_downloads) AS unique_downloads,
            SUM(citations) AS citations
         FROM metrics_article_daily
         WHERE day LIKE ${`${dayPrefix}%`} AND source='digitopub'
         GROUP BY article_id, journal_id`

    const mapped = rows.map((r) => ({
        article_id: r.article_id,
        journal_id: r.journal_id,
        year,
        month,
        views: Number(r.views ?? 0),
        unique_views: Number(r.unique_views ?? 0),
        downloads: Number(r.downloads ?? 0),
        unique_downloads: Number(r.unique_downloads ?? 0),
        citations: Number(r.citations ?? 0),
        source: "digitopub" as const,
    }))
    await prisma.metricsArticleMonthly.createMany({ data: mapped, skipDuplicates: true })
    const updates = mapped.map((r) =>
        prisma.metricsArticleMonthly.updateMany({
            where: {
                article_id: r.article_id,
                year,
                month,
                source: "digitopub" as const,
            },
            data: {
                journal_id: r.journal_id,
                views: r.views,
                unique_views: r.unique_views,
                downloads: r.downloads,
                unique_downloads: r.unique_downloads,
                citations: r.citations,
                computed_at: new Date(),
            },
        })
    )
    if (updates.length > 0) await prisma.$transaction(updates)
    return { year, month, upserted: mapped.length }
}

interface UserAggRow {
    orcid: string
    views: bigint
    downloads: bigint
    citations: bigint
    first_seen_at: Date
    last_event_at: Date
}

/** Recomputes lifetime per-ORCID totals into `user_metrics`. */
export async function updateUserMetrics(): Promise<{ upserted: number }> {
    const rows = await prisma.$queryRaw<UserAggRow[]>`
        SELECT
            orcid,
            SUM(CASE WHEN event_type='view' THEN 1 ELSE 0 END) AS views,
            SUM(CASE WHEN event_type='download' THEN 1 ELSE 0 END) AS downloads,
            SUM(CASE WHEN event_type='citation_export' THEN 1 ELSE 0 END) AS citations,
            MIN(created_at) AS first_seen_at,
            MAX(created_at) AS last_event_at
         FROM user_event
         WHERE orcid IS NOT NULL
         GROUP BY orcid`

    const mapped = rows.map((r) => ({
        orcid: r.orcid,
        views: Number(r.views ?? 0),
        downloads: Number(r.downloads ?? 0),
        citations: Number(r.citations ?? 0),
        first_seen_at: r.first_seen_at,
        last_event_at: r.last_event_at,
    }))
    await prisma.userMetrics.createMany({ data: mapped, skipDuplicates: true })
    const updates = mapped.map((r) =>
        prisma.userMetrics.updateMany({
            where: { orcid: r.orcid },
            data: {
                views: r.views,
                downloads: r.downloads,
                citations: r.citations,
                last_event_at: r.last_event_at,
            },
        })
    )
    if (updates.length > 0) await prisma.$transaction(updates)
    return { upserted: mapped.length }
}

const RETENTION_BATCH = 50_000
const RETENTION_DAYS = 18 * 30 // ~18 months
/** Subscriber-import staging rows only back the preview step (#197). */
const IMPORT_STAGING_RETENTION_DAYS = 14

/**
 * Hard-deletes `user_event` rows past the ~18-month retention window in
 * batches. `deadlineMs` is a soft wall-clock budget for the HTTP trigger
 * (shared-hosting request timeout); when exceeded the job returns
 * `completed: false` and the next scheduled run resumes where it left off.
 * Also purges subscriber-import staging rows older than 14 days and
 * pending (never-confirmed) alert subscribers older than 90 days.
 */
export async function retentionCleanup(
    opts: { deadlineMs?: number } = {}
): Promise<{
    cutoff: string
    totalDeleted: number
    completed: boolean
    importRowsDeleted: number
    pendingSubscribersDeleted: number
}> {
    const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : null
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    let totalDeleted = 0
    let completed = true
    for (;;) {
        // $executeRaw tagged template binds ${cutoff}/${RETENTION_BATCH} as
        // driver parameters (not string interpolation) — no raw/unsafe helper.
        const result = await prisma.$executeRaw`
            DELETE FROM user_event WHERE created_at < ${cutoff} ORDER BY id LIMIT ${RETENTION_BATCH}
        `
        const deleted = Number(result)
        totalDeleted += deleted
        if (deleted < RETENTION_BATCH) break
        if (deadline && Date.now() > deadline) {
            completed = false
            break
        }
        // Yield a moment before the next batch to keep replicas comfortable.
        await new Promise((r) => setTimeout(r, 250))
    }
    const stagingCutoff = new Date(Date.now() - IMPORT_STAGING_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const staging = await prisma.subscriberImportRow.deleteMany({ where: { created_at: { lt: stagingCutoff } } })
    // Never-confirmed opt-ins (public form or import invitations) are not kept;
    // updated_at, so a fresh confirmation request restarts the clock.
    const pendingCutoff = new Date(Date.now() - PENDING_SUBSCRIBER_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const pending = await prisma.notificationSubscriber.deleteMany({
        where: { status: "pending", confirmed_at: null, updated_at: { lt: pendingCutoff } },
    })
    return {
        cutoff: cutoff.toISOString(),
        totalDeleted,
        completed,
        importRowsDeleted: staging.count,
        pendingSubscribersDeleted: pending.count,
    }
}
