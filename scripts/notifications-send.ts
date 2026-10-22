/**
 * Send one throttled batch of queued notification deliveries — thin CLI
 * wrapper around `runSendBatch()` (shared with
 * POST /api/notifications/cron/send). Respects NOTIFY_MAX_PER_RUN/HOUR/DAY.
 * Ignores NOTIFICATIONS_ENABLED: running it by hand is an explicit choice.
 */

import "dotenv/config"
import { prisma } from "@/src/lib/db/config"
import { runSendBatch } from "@/src/features/notifications/server/send-service"
import { SmtpNotificationTransport } from "@/src/lib/email/notification-transport"
import { withSyncRun } from "@/src/features/ojs/server/sync-runs"

async function main() {
    const transport = new SmtpNotificationTransport()
    try {
        const r = await withSyncRun("notifications_send", "cron", async () => {
            const res = await runSendBatch(transport)
            return { status: res.remaining > 0 ? ("partial" as const) : ("success" as const), stats: { ...res }, result: res }
        })
        // eslint-disable-next-line no-console
        console.log(`[notifications-send] budget=${r.budget} sent=${r.sent} failed=${r.failed} retried=${r.retried} skipped=${r.skipped} remaining=${r.remaining}`)
    } finally {
        transport.close()
    }
}

main()
    .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[notifications-send] failed:", err)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
