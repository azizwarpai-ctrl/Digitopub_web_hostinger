/**
 * Build article digest drafts — thin CLI wrapper around `runDigests()`
 * (shared with POST /api/notifications/cron/digests). Daily every run,
 * weekly on Mondays (UTC). Never sends email. Ignores NOTIFICATIONS_ENABLED.
 */

import "dotenv/config"
import { prisma } from "@/src/lib/db/config"
import { runDigests } from "@/src/features/notifications/server/digests"
import { notifyAdminsOfDrafts } from "@/src/features/notifications/server/cron-route"
import { withSyncRun } from "@/src/features/ojs/server/sync-runs"

async function main() {
    const results = await withSyncRun("notifications_digests", "cron", async () => {
        const r = await runDigests()
        return { status: "success" as const, stats: { digests: r }, result: r }
    })
    await notifyAdminsOfDrafts(results.filter((r) => r.drafted).length)
    for (const r of results) {
        // eslint-disable-next-line no-console
        console.log(`[notifications-digests] ${r.kind} articles=${r.articles} recipients=${r.recipients} drafted=${r.drafted}`)
    }
}

main()
    .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[notifications-digests] failed:", err)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
