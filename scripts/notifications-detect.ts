/**
 * Detect newly published OJS issues/articles and draft issue campaigns —
 * thin CLI wrapper around `detectPublications()` (shared with
 * POST /api/notifications/cron/detect). Never sends email. Idempotent.
 * Ignores NOTIFICATIONS_ENABLED: running it by hand is an explicit choice.
 */

import "dotenv/config"
import { prisma } from "@/src/lib/db/config"
import { detectPublications } from "@/src/features/notifications/server/detect-publications"
import { notifyAdminsOfDrafts } from "@/src/features/notifications/server/cron-route"
import { withSyncRun } from "@/src/features/ojs/server/sync-runs"

async function main() {
    const result = await withSyncRun("notifications_detect", "cron", async () => {
        const r = await detectPublications()
        return { status: r.partial ? ("partial" as const) : ("success" as const), stats: { ...r }, result: r }
    })
    await notifyAdminsOfDrafts(result.drafts)
    // eslint-disable-next-line no-console
    console.log(
        `[notifications-detect] initialised=${result.initialised} issues=${result.issues} articles=${result.articles} drafts=${result.drafts} partial=${result.partial}`
    )
}

main()
    .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[notifications-detect] failed:", err)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
