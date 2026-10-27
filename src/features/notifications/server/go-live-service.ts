/**
 * Go-live helpers for hosts without shell access: install the starter data
 * the seed scripts would create, send a deliverability test through the
 * alerts mailbox, and report which production prerequisites are in place.
 */

import { prisma } from "@/src/lib/db/config"
import { renderHtmlTemplate, renderTemplate } from "@/src/lib/email/renderer"
import {
    getNotificationTransport,
    isNotificationSmtpConfigured,
    notificationFromAddress,
} from "@/src/lib/email/notification-transport"

import { getActiveEmailStyle, getSettings } from "./admin-config-service"
import { getEmailStyle } from "./email-styles"
import { listUnsubscribeHeaders } from "./compose"
import { isNotificationsEnabled } from "./config"
import { RAW_BLOCK_VARIABLES } from "./render-blocks"
import { sampleVariables } from "./sample-data"
import { seedNotificationDefaults } from "./seed"
import { sendToEach, type TestSendResult } from "./test-send-budget"
import { NOTIFICATION_TEMPLATE_KEYS, getDefaultTemplate, seedNotificationTemplates } from "./templates"

export async function installDefaults() {
    const seeded = await seedNotificationDefaults(prisma)
    const templates = await seedNotificationTemplates(prisma, { style: await getActiveEmailStyle() })
    return {
        disciplines: seeded.disciplines,
        rules: seeded.rules,
        templatesCreated: templates.created.length,
        templatesKept: templates.kept.length,
    }
}

const TEST_TEMPLATE = NOTIFICATION_TEMPLATE_KEYS.newIssue

/** Sends a sample new-issue alert to each address through the alerts transport, with the real bulk headers. */
export async function sendDeliverabilityTest(recipients: readonly string[]): Promise<TestSendResult> {
    const stored = await prisma.emailTemplate.findUnique({
        where: { name: TEST_TEMPLATE },
        select: { subject: true, html_content: true, text_content: true },
    })
    const settings = await getSettings()
    const style = getEmailStyle(settings.email_style)
    const t = stored ?? getDefaultTemplate(TEST_TEMPLATE, style)!
    const vars = sampleVariables(TEST_TEMPLATE, style)
    if (settings.publisher_address) vars.publisher_address = settings.publisher_address
    vars.preheader = "Deliverability test of the publication alert format"
    const message = {
        subject: renderTemplate(t.subject, vars).replace(/[\r\n]+/g, " ").trim(),
        html: renderHtmlTemplate(t.html_content, vars, RAW_BLOCK_VARIABLES),
        text: renderTemplate(t.text_content ?? "", vars),
        headers: listUnsubscribeHeaders(vars.unsubscribe_url, "deliverability-test"),
    }
    const transport = getNotificationTransport()
    return sendToEach(recipients, (to) => transport.send({ ...message, to }))
}

export interface ReadinessItem {
    key: string
    label: string
    ok: boolean
    detail: string
}

const CRON_JOBS = [
    { job: "notifications_detect", label: "Publication detection cron (every 30 min)", maxAgeMs: 2 * 60 * 60 * 1000 },
    { job: "notifications_digests", label: "Digest cron (daily 07:00 UTC)", maxAgeMs: 26 * 60 * 60 * 1000 },
    { job: "notifications_send", label: "Send cron (every 5 min)", maxAgeMs: 30 * 60 * 1000 },
] as const

/** Production prerequisites, as booleans and timestamps only; secret values are never returned. */
export async function getReadiness(now = new Date()): Promise<ReadinessItem[]> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
    const templateNames = Object.values(NOTIFICATION_TEMPLATE_KEYS)
    const [settings, disciplines, templates, runs] = await Promise.all([
        getSettings(),
        prisma.discipline.count(),
        prisma.emailTemplate.count({ where: { name: { in: templateNames } } }),
        Promise.all(CRON_JOBS.map(({ job }) => prisma.syncRun.findFirst({
            where: { job_name: job },
            orderBy: { started_at: "desc" },
            select: { started_at: true, status: true },
        }))),
    ])

    const items: ReadinessItem[] = [
        {
            key: "token_secret", label: "NOTIFY_TOKEN_SECRET",
            ok: !!process.env.NOTIFY_TOKEN_SECRET,
            detail: process.env.NOTIFY_TOKEN_SECRET ? "Set" : "Missing: sign-up, manage and unsubscribe links will not work",
        },
        {
            key: "cron_secret", label: "CRON_SECRET",
            ok: !!process.env.CRON_SECRET,
            detail: process.env.CRON_SECRET ? "Set" : "Missing: every cron call is rejected with 401",
        },
        {
            key: "app_url", label: "NEXT_PUBLIC_APP_URL",
            ok: appUrl.startsWith("https://"),
            detail: appUrl ? appUrl : "Missing: links in emails would point to localhost",
        },
        {
            key: "smtp", label: "Alerts mailbox (NOTIFY_SMTP_*)",
            ok: isNotificationSmtpConfigured(),
            detail: isNotificationSmtpConfigured() ? `Sending as ${notificationFromAddress()}` : "No SMTP host, user and password",
        },
        {
            key: "publisher_address", label: "Publisher postal address",
            ok: !!settings.publisher_address.trim(),
            detail: settings.publisher_address.trim() ? "Saved" : "Required in every email footer: fill it in below",
        },
        {
            key: "disciplines", label: "Discipline taxonomy",
            ok: disciplines > 0,
            detail: disciplines > 0 ? `${disciplines} disciplines` : "Empty: click Install starter data",
        },
        {
            key: "templates", label: "Notification email templates",
            ok: templates === templateNames.length,
            detail: `${templates} of ${templateNames.length} installed`,
        },
        ...CRON_JOBS.map(({ job, label, maxAgeMs }, i): ReadinessItem => {
            const run = runs[i]
            if (!run) return { key: job, label, ok: false, detail: "Never called: check the Scheduler workflow in GitHub Actions" }
            const recent = now.getTime() - run.started_at.getTime() <= maxAgeMs
            return {
                key: job, label,
                ok: recent && run.status !== "failed",
                detail: `Last run ${run.started_at.toISOString().replace("T", " ").slice(0, 16)} UTC (${run.status})${recent ? "" : ", overdue"}`,
            }
        }),
        {
            key: "enabled", label: "NOTIFICATIONS_ENABLED",
            ok: isNotificationsEnabled(),
            detail: isNotificationsEnabled() ? "true: detection, digests and sending are on" : "false: set it to true last, after the test scores 9/10",
        },
    ]
    return items
}
