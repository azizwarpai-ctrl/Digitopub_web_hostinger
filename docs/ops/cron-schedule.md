# Recurring Job Schedule

The production host has **no user crontab** (see [`discovery-2026-08.md`](./discovery-2026-08.md)).
All recurring jobs are exposed as Bearer-protected HTTP endpoints and must be scheduled via
**hPanel → Advanced → Cron Jobs** (curl commands) or an external scheduler (e.g. cron-job.org).

Every endpoint:
- requires `Authorization: Bearer $CRON_SECRET` (timing-safe compare; 401 otherwise) —
  **`CRON_SECRET` must be present in the production environment**;
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
| OJS write queue | `POST /api/ojs/cron/push-sync` | `*/10 * * * *` | Retries writes to OJS that failed when saved (journal specialization, #234). Exponential backoff per job (1 min … 6 h, no cap for retryable errors; permanent failures stop). 207 = jobs attempted in this run are still retrying or failed (see admin journal page); 200 = no attempted failures/retries, although jobs waiting for future backoff may remain queued. Needs `OJS_API_KEY` + user bridge reachable. |
| Citation counts (#232) | `POST /api/metrics/cron/citations` | `30 6 * * *` | Refreshes times-cited for every published DigitoPub DOI from Crossref `is-referenced-by-count` and OpenAlex `cited_by_count` (keeps the higher) into `article_citation_counts`. Least recently checked first; 207 = more DOIs next run. A failed lookup keeps the last count. Pages only read the table. Optional `CROSSREF_MAILTO` for the polite-pool contact. |
| Notification send queue | `POST /api/notifications/cron/send` | `*/5 * * * *` | Sends queued publication-alert emails within `NOTIFY_MAX_PER_RUN`, `NOTIFY_MAX_PER_HOUR` and `NOTIFY_MAX_PER_DAY`. 207 = deliveries still queued, 200 = queue empty. No-op (200 `skipped`) unless `NOTIFICATIONS_ENABLED=true`. |

## OJS journal content drift

`GET /api/ojs/sync` is the full scheduled OJS → digitopub mirror. Independently, the public journal listing runs a throttled drift check every 5 minutes and starts the same sync in the background when its fingerprint changes. The v2 fingerprint covers journal IDs, enabled states, paths, primary locales, and every mirrored setting, including descriptions and cover images. It excludes `digitopubSpecialization` because digitopub owns `Journal.field`.

Each sync captures the fingerprint before fetching OJS and stores it only after a successful mirror write. The first v2 run differs from the old stored format and triggers one catch-up automatically; no fingerprint reset is needed.

This read mirror uses `OJS_DATABASE_*`. It is separate from #234's `POST /api/ojs/cron/push-sync` write queue and does not use `OJS_USER_BRIDGE_URL`.

To verify recovery, check admin **Sync health** for a recent successful `ojs_journals_sync`, then compare `GET /api/journals/ojbr` with OJS and open the public OJBR page. The current OJS description and cover should be present, `last_synced_at` should have advanced, and `field` should be unchanged.

## Scheduler: GitHub Actions (#235)

`.github/workflows/scheduler.yml` triggers every job above on its schedule
(one cron trigger per row), using the repository secret `CRON_SECRET`
(same value as production). Run any job by hand from **Actions → Scheduler →
Run workflow → job**. 200/207 = done, 429 = lock held (skipped), 503 = job
disabled (skipped); any other status fails the run, which shows in Actions.
GitHub can start scheduled runs a few minutes late; every job here tolerates
that. If `CRON_SECRET` is rotated, update the repository secret too.

Before this workflow existed, no scheduler was configured: until 2026-10-27
the ledger shows only drift-triggered OJS syncs, and the notification and
metrics jobs had never run.

## Exact commands (manual fallback)

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

# every 10 minutes (OJS write queue: retries journal specialization sync, #234)
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://digitopub.com/api/ojs/cron/push-sync

# daily 06:30 UTC (citation counts, #232)
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://digitopub.com/api/metrics/cron/citations

# every 5 minutes (send queue; throttled)
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://digitopub.com/api/notifications/cron/send
```

Step-by-step cron-job.org setup for the three notification jobs: [`notifications-go-live.md`](./notifications-go-live.md), Step 5.

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
bun run scripts/notifications-send.ts
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
