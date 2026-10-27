/**
 * Admin-only analytics summary types.
 *
 * Every field here is either a real, source-cited number or a `null` empty-
 * state placeholder. There are no derived multipliers or hard-coded statuses
 * in this DTO. See tests/unit/admin-metrics-fabrication-guard.test.ts for the
 * regression guard that keeps it that way.
 */

export interface AdminAnalyticsTotals {
  journals: number
  submissions: number
  accepted: number
  published: number
  reviews: number
  /** Percentage. 0 when there are no submissions. */
  acceptanceRate: number
}

export interface AdminAnalyticsFieldGroup {
  field: string
  submissions: number
}

/**
 * Rolling 7-day counters.
 *
 * Each `null` means "the event source is empty for the window" — render as
 * an explicit "—" / "No data yet" empty state, never as zero with the same
 * weight as a real zero would carry.
 */
export interface AdminAnalyticsLast7Days {
  newSubmissions: number
  completedReviews: number
  publishedArticles: number
  /** From UserEvent.event_type='view'. `null` when no view events have ever been recorded. */
  views: number | null
  /** From UserEvent.event_type='download'. `null` when no download events have ever been recorded. */
  downloads: number | null
}

export interface AdminAnalyticsHealth {
  database: { ok: boolean; error: string | null }
  /**
   * OJS integration probe. `configured: false` when OJS_DATABASE_* env vars
   * are not set — render that as a neutral "not configured" state, not a
   * failure.
   */
  ojs: { ok: boolean; configured: boolean; error: string | null }
}

export interface AdminAnalyticsSummary {
  totals: AdminAnalyticsTotals
  fieldGroups: AdminAnalyticsFieldGroup[]
  last7: AdminAnalyticsLast7Days
  health: AdminAnalyticsHealth
  /**
   * False when the OJS-sourced figures (submissions/accepted/reviews/field
   * groups + last7 editorial counts) could not be read — OJS unconfigured or
   * unreachable. The UI shows those as an unavailable state, not as zeros.
   * Journal count + snapshot-backed totals (published/views/downloads) stay
   * valid regardless.
   */
  ojsAvailable: boolean
  /** ISO timestamp of when the response was computed (server clock). */
  computedAt: string
}

// ─── Timeseries (GET /admin-analytics/timeseries) ────────────────────

export interface TimeseriesPoint {
  /** `YYYY-MM-DD` (interval=day) or `YYYY-MM` (interval=month). */
  date: string
  /**
   * `null` only when the series' `hasData` is false (source table empty —
   * render "No data yet"). With data present, absent buckets are honest 0s.
   */
  value: number | null
}

export interface TimeseriesSeries {
  metric: string
  /** False when the metric's source table has no rows at all. */
  hasData: boolean
  /** Dense date spine — one point per day/month in [from, to]. */
  points: TimeseriesPoint[]
}

export interface TimeseriesResponse {
  interval: "day" | "month"
  from: string
  to: string
  series: TimeseriesSeries[]
  computedAt: string
}

// ─── Sync health (GET /admin-analytics/sync-health) ──────────────────

export interface SyncHealthRunSummary {
  status: string
  startedAt: string
  durationMs: number | null
}

export interface SyncHealthJob {
  jobName: string
  lastRun: {
    id: string
    status: string
    triggeredBy: string
    startedAt: string
    finishedAt: string | null
    durationMs: number | null
    error: string | null
    stats: Record<string, unknown> | null
  }
  lastSuccessAt: string | null
  /** Consecutive failed/partial runs from the most recent backwards. */
  failureStreak: number
  recentRuns: SyncHealthRunSummary[]
}

/** Journal covers as checked by the latest OJS journal sync (#239). */
export interface SyncHealthCovers {
  checked: number
  /** OJS paths whose stored cover does not load. */
  broken: string[]
  /** OJS paths where the sync refused a broken new URL and kept the working one. */
  keptOld: string[]
  checkedAt: string
}

export interface SyncHealthResponse {
  jobs: SyncHealthJob[]
  /** Sum of per-job failure streaks — drives the header alert badge. */
  totalFailureStreak: number
  /** Null until a journal sync has recorded a cover check. */
  covers: SyncHealthCovers | null
  computedAt: string
}
