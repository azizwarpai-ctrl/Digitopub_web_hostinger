/**
 * Notification cron endpoints, mounted at /notifications/cron BEFORE the
 * admin router (whose use("*", requireAdmin) would otherwise reject the
 * scheduler). Protected by cronEndpoint(): Bearer CRON_SECRET, a DB lock and
 * a SyncRun row. Schedule: docs/ops/cron-schedule.md.
 */

import { Hono } from "hono"

import { prisma } from "@/src/lib/db/config"
import { cronEndpoint } from "@/src/lib/cron-endpoint"
import { sendEmail } from "@/src/lib/email/service"

import { getAppBaseUrl, isNotificationsEnabled } from "./config"
import { detectPublications } from "./detect-publications"
import { runDigests } from "./digests"

/** Tells admins that drafts are waiting. Best effort: a mail failure never fails the job. */
export async function notifyAdminsOfDrafts(count: number): Promise<void> {
    if (count <= 0) return
    try {
        const admins = await prisma.adminUser.findMany({
            where: { role: { in: ["admin", "superadmin"] } },
            select: { email: true },
        })
        const url = `${getAppBaseUrl()}/admin/notifications/campaigns`
        await Promise.all(admins.map((a) => sendEmail({
            to: a.email,
            subject: `${count} notification draft(s) ready for review`,
            html: `<p>${count} publication notification draft(s) are waiting for review. Nothing is sent until an admin approves them.</p><p><a href="${url}">Review drafts</a></p>`,
            text: `${count} publication notification draft(s) are waiting for review. Nothing is sent until an admin approves them.\n\nReview drafts: ${url}`,
        })))
    } catch (e) {
        console.error("[Notifications] draft-ready email failed:", e instanceof Error ? e.message : e)
    }
}

const SKIPPED = { partial: false, stats: { skipped: true, reason: "NOTIFICATIONS_ENABLED is not true" } }

const app = new Hono()
    .post("/detect", cronEndpoint("notifications_detect", async () => {
        if (!isNotificationsEnabled()) return SKIPPED
        const result = await detectPublications()
        await notifyAdminsOfDrafts(result.drafts)
        return { partial: result.partial, stats: { ...result } }
    }))
    .post("/digests", cronEndpoint("notifications_digests", async () => {
        if (!isNotificationsEnabled()) return SKIPPED
        const results = await runDigests()
        await notifyAdminsOfDrafts(results.filter((r) => r.drafted).length)
        return { partial: false, stats: { digests: results } }
    }))

export { app as notificationsCronRouter }
