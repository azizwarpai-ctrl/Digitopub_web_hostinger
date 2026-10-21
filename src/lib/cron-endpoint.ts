/**
 * Shared wrapper for HTTP-triggered recurring jobs. The production host has
 * no crontab, so jobs are hit over HTTP by an external scheduler; every
 * trigger gets the same protection stack: Bearer CRON_SECRET (timing-safe),
 * a self-expiring DB lock (429 while held), and a SyncRun ledger row.
 * Schedule: docs/ops/cron-schedule.md.
 */

import type { Context } from "hono"
import { verifyCronSecret } from "@/src/lib/cron-auth"
import { acquireJobLock } from "@/src/lib/cron-lock"
import { withSyncRun } from "@/src/features/ojs/server/sync-runs"

export const CRON_LOCK_WINDOW_MS = 5 * 60 * 1000

export function cronEndpoint(
    jobName: string,
    run: (c: Context) => Promise<{ partial: boolean; stats: Record<string, unknown> }>,
    opts: { lockWindowMs?: number } = {},
) {
    return async (c: Context) => {
        if (!verifyCronSecret(c.req.header("authorization"))) {
            return c.json({ success: false, error: "Unauthorized" }, 401)
        }
        if (!(await acquireJobLock(`${jobName}_lock`, opts.lockWindowMs ?? CRON_LOCK_WINDOW_MS))) {
            return c.json(
                { success: false, error: "Job already in progress or recently completed" },
                429
            )
        }
        try {
            const outcome = await withSyncRun(jobName, "http", async () => {
                const { partial, stats } = await run(c)
                return {
                    status: partial ? ("partial" as const) : ("success" as const),
                    stats,
                    result: { partial, stats },
                }
            })
            return c.json(
                { success: !outcome.partial, ...outcome.stats },
                outcome.partial ? 207 : 200
            )
        } catch (error) {
            console.error(`[${jobName}] cron run failed:`, error)
            return c.json({ success: false, error: "Job failed" }, 500)
        }
    }
}
