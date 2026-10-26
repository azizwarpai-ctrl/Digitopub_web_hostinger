import { Hono } from "hono"
import { ojsJournalsResponseSchema } from "../schemas/ojs-schema"
import { isOjsConfigured, ojsHealthCheck } from "./ojs-client"
import { syncOjsJournals } from "./sync-ojs-journals"
import { fetchFromDatabase } from "./ojs-service"
import { ojsCache, isFresh, isServableStale, isErrorCached, setCacheEntry, markCacheError } from "./ojs-cache"
import { provisionRouter } from "./provision-route"
import { verifyCronSecret } from "@/src/lib/cron-auth"
import { acquireJobLock } from "@/src/lib/cron-lock"
import { withSyncRun } from "./sync-runs"
import { refreshOjsJournalSnapshots } from "./ojs-journal-snapshots"
import { drainDueSyncJobs } from "./ojs-sync-jobs"
import { cronEndpoint } from "@/src/lib/cron-endpoint"

// Window during which a fresh sync request will be rejected. Covers both
// "another sync is in flight" and "a sync just finished" — Google/cron
// retries shouldn't hammer OJS.
const SYNC_LOCK_KEY = "ojs_sync_lock"
const SYNC_LOCK_WINDOW_MS = 5 * 60 * 1000

const app = new Hono()

// GET /ojs/journals
app.get("/journals", async (c) => {
    try {
        if (!isOjsConfigured()) {
            return c.json({ success: true, data: [], configured: false }, 200)
        }

        const start = Date.now()

        if (isFresh(ojsCache.journals)) {
            return c.json({ ...ojsCache.journals.data, latencyMs: Date.now() - start }, 200)
        }

        // Negative cache: a fetch just failed — serve stale if we have it
        // rather than re-hammering the 3-connection OJS pool.
        if (isErrorCached(ojsCache.journals)) {
            if (isServableStale(ojsCache.journals)) {
                return c.json({ ...ojsCache.journals.data, stale: true, latencyMs: Date.now() - start }, 200)
            }
            return c.json({ success: false, configured: true, error: "OJS temporarily unavailable" }, 503)
        }

        let journals
        try {
            journals = await fetchFromDatabase()
        } catch (fetchError) {
            // Stale-while-revalidate: degrade to stale data on OJS outage
            // (e.g. a SiteGround IP-whitelist flap) instead of failing.
            console.error("Error fetching OJS journals:", fetchError)
            markCacheError(ojsCache.journals)
            if (isServableStale(ojsCache.journals)) {
                return c.json({ ...ojsCache.journals.data, stale: true, latencyMs: Date.now() - start }, 200)
            }
            return c.json(
                { success: false, configured: true, error: "Failed to fetch OJS journals" },
                500
            )
        }

        const responsePayload = { success: true as const, data: journals, configured: true as const }

        const validated = ojsJournalsResponseSchema.safeParse(responsePayload)
        if (!validated.success) {
            console.error("OJS response validation failed:", validated.error.flatten())
            return c.json(
                { success: false, configured: true, error: "Internal data validation error" },
                500
            )
        }

        const validatedData = validated.data
        setCacheEntry(ojsCache.journals, validatedData)

        return c.json({ ...validatedData, latencyMs: Date.now() - start }, 200)
    } catch (error) {
        console.error("Error fetching OJS journals:", error)
        return c.json(
            { success: false, configured: true, error: "Failed to fetch OJS journals" },
            500
        )
    }
})

// GET /ojs/sync — Cron-triggered synchronization endpoint
// Protected by Authorization: Bearer <CRON_SECRET> header
app.get("/sync", async (c) => {
    if (!verifyCronSecret(c.req.header("authorization"))) {
        return c.json({ success: false, error: "Unauthorized" }, 401)
    }

    if (process.env.OJS_SYNC_ENABLED === "false") {
        console.log("[OJS_SYNC] Skipped: OJS_SYNC_ENABLED=false")
        return c.json({ success: false, error: "OJS sync disabled (OJS_SYNC_ENABLED=false)" }, 503)
    }

    if (!isOjsConfigured()) {
        return c.json({ success: false, error: "OJS not configured" }, 503)
    }

    try {
        if (!(await acquireJobLock(SYNC_LOCK_KEY, SYNC_LOCK_WINDOW_MS))) {
            return c.json(
                { success: false, error: "Sync already in progress or recently completed" },
                429
            )
        }

        const start = Date.now()
        const syncResult = await withSyncRun("ojs_journals_sync", "http", async () => {
            // Sync everything, including disabled journals, so they get marked
            // inactive; deactivateMissing soft-deletes journals removed in OJS.
            const journals = await fetchFromDatabase(true)
            const result = await syncOjsJournals(journals, { deactivateMissing: true })
            const snapshots = await refreshOjsJournalSnapshots()
            return {
                status: result.errors > 0 ? ("partial" as const) : ("success" as const),
                stats: { ...result, snapshots },
                result: { ...result, snapshots },
            }
        })

        const success = syncResult.errors === 0
        const status = success ? 200 : 207

        return c.json({
            success,
            ...syncResult,
            latencyMs: Date.now() - start,
        }, status)
    } catch (error) {
        console.error("[OJS_SYNC] Cron sync failed:", error)
        return c.json({ success: false, error: "Sync failed" }, 500)
    }
})

// GET /ojs/health — Full diagnostic endpoint for the debug page
app.get("/health", async (c) => {
    if (!isOjsConfigured()) {
        return c.json({ ok: false, configured: false, mode: "none", error: null })
    }

    const diagnostic = await ojsHealthCheck()
    return c.json(
        { ...diagnostic, mode: "direct" },
        diagnostic.ok ? 200 : 503
    )
})

// Mount Provisioning router
app.route("/register", provisionRouter)

// ─── POST /ojs/cron/push-sync — drain the OJS write queue (#234) ──
// Retries journal specializations (and later other writes) that could not
// reach OJS when they were saved. Every 10 minutes: docs/ops/cron-schedule.md.
app.post("/cron/push-sync", cronEndpoint("ojs_push_sync", async () => {
    const stats = await drainDueSyncJobs()
    return { partial: stats.retrying > 0 || stats.failed > 0, stats }
}, { lockWindowMs: 2 * 60 * 1000 }))

export { app as ojsRouter }

