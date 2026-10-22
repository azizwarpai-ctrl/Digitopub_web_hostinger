# Recurring Job Schedule

The production host has **no user crontab** (see [`discovery-2026-08.md`](./discovery-2026-08.md)).
All recurring jobs are exposed as Bearer-protected HTTP endpoints and must be scheduled via
**hPanel → Advanced → Cron Jobs** (curl commands) or an external scheduler (e.g. cron-job.org).

Every endpoint:
- requires `Authorization: Bearer $CRON_SECRET` (timing-safe compare; 401 otherwise) —
  **`CRON_SECRET` must be added to the production env first, it is currently missing**;
- holds a self-expiring DB lock (5 min) — concurrent/rapid retries get **429**;
- writes a `sync_runs` ledger row (job name, trigger, status, stats, error) for observability;
- returns **200** on success, **207** on partial completion (the next tick resumes).

## Schedule

| Job | Endpoint | Schedule (UTC) | Notes |
| --- | --- | --- | --- |
| OJS journals sync + snapshots | `GET /api/ojs/sync` | `*/15 * * * *` | Skips via 503 when `OJS_SYNC_ENABLED=false`. Includes soft-delete pass + `ojs_journal_snapshots` refresh (watermark-gated, usually a no-op). |
| Daily metrics aggregation | `POST /api/metrics/cron/daily` | `0 2 * * *` | Previous UTC day; `?day=YYYY-MM-DD` to re-run a specific day. Idempotent. |
| Monthly metrics rollup | `POST /api/metrics/cron/monthly` | `0 3 1 * *` | Previous UTC month; `?month=YYYY-MM` override. Idempotent. |
| User (ORCID) lifetime metrics | `POST /api/metrics/cron/user` | `0 4 * * *` | After daily aggregation. |
| Event retention cleanup | `POST /api/metrics/cron/retention` | `0 5 * * 0` | ~18-month retention. 50 s soft deadline per run; 207 = more to delete next week (or run again). Also purges notification import staging (14 d) and never-confirmed alert subscribers (90 d). |
| Publication detection | `POST /api/notifications/cron/detect` | `*/30 * * * *` | New OJS issues/articles → `publication_events` + **draft** issue campaigns (never sends). First run only stores the watermark. 207 = more than 200 candidates, continues next run. No-op (200 `skipped`) unless `NOTIFICATIONS_ENABLED=true`. |
| Article digests | `POST /api/notifications/cron/digests` | `0 7 * * *` | Daily digest draft every day; weekly digest draft on Mondays (UTC). Contiguous windows. Same kill switch. |

## Exact commands (hPanel cron / external scheduler)

```bash
# every 15 minutes
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://digitopub.com/api/ojs/sync

# daily 02:00 UTC
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://digitopub.com/api/metrics/cron/daily

# monthly, 1st 03:00 UTC
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://digitopub.com/api/metrics/cron/monthly

# daily 04:00 UTC
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://digitopub.com/api/metrics/cron/user

# weekly, Sunday 05:00 UTC
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://digitopub.com/api/metrics/cron/retention

# every 30 minutes (publication detection; drafts only)
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://digitopub.com/api/notifications/cron/detect

# daily 07:00 UTC (daily digest; weekly digest on Mondays)
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://digitopub.com/api/notifications/cron/digests
```

If hPanel cron cannot run `curl` with headers, use cron-job.org (supports custom headers);
the endpoints are safe to expose since they fail closed without the secret.

## CLI fallbacks (same logic, same ledger)

Each job also has a CLI wrapper for manual runs from a workstation with a production
`DATABASE_URL` (and `OJS_DATABASE_*` for the sync):

```bash
bun run ojs:sync
bun run scripts/aggregate-daily-metrics.ts [--day=YYYY-MM-DD]
bun run scripts/aggregate-monthly-metrics.ts [--month=YYYY-MM]
bun run scripts/update-user-metrics.ts
bun run scripts/retention-cleanup.ts
bun run scripts/notifications-detect.ts
bun run scripts/notifications-digests.ts
```

## Observability

`SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 20;` — or Prisma Studio →
`sync_runs`. A failure streak on `ojs_journals_sync` most likely means the SiteGround
Remote-MySQL whitelist dropped the app's outbound IP (see discovery doc, risk #1).

## Admin dashboard data sources (what needs cron vs. what is live)

The admin Dashboard / Analytics / Authors figures come from three different
sources — the local `journals` table (OJS journal sync), the synced
`ojs_journal_snapshots` aggregates, and live OJS queries — so an empty value is
not mistaken for a bug. The table below states each metric's source and when it
populates:

| Surface | Source | Populated when |
|---|---|---|
| Total Journals | local `journals` (OJS journal sync) | after any `ojs:sync` / journals self-heal |
| Published Articles, lifetime Views, lifetime Downloads | `ojs_journal_snapshots` aggregates | after `ojs:sync` refreshes snapshots (watermark-gated) |
| Total Submissions, Under Review, Accepted, Rejected, Total Authors, Total Reviews, Recent Submissions, Submissions-by-Field, "Last 7 days" new-submissions/completed-reviews/published | **live OJS queries** (`ojs-stats-service.ts`, `ojs-review-service.ts`) | immediately, whenever OJS is reachable; otherwise the UI shows an explicit "OJS unavailable" state |
| **14-day sparklines** (Views/Downloads/Submissions timeseries) and "Last 7 days" **Article Views/Downloads** | local `metrics_article_daily` / `user_event` | only after (a) real end-user traffic writes `user_event` rows AND (b) the metrics cron (`/api/metrics/cron/daily`) has aggregated them |

**Consequence:** the 14-day sparklines and the two engagement rows legitimately
show "No data yet" until `CRON_SECRET` is set in prod **and** the daily metrics
cron has run against recorded traffic. This is expected, not a regression. All
other figures populate as soon as OJS is reachable / snapshots have synced.
