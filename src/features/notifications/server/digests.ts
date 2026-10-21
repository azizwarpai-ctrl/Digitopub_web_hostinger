/**
 * Article digest drafts (#200). Daily digests run every day for subscribers
 * who chose `daily`; weekly digests run on Mondays (UTC) for `weekly`.
 *
 * Windows are contiguous: each run covers (previous `to`, now], so no
 * article is skipped or repeated even if a run is late. Articles that were
 * part of an announced issue are left out (the issue email covered them).
 * A digest with no recipients is not drafted, but its window still advances.
 */

import { Prisma } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"

import type { ArticleFrequency } from "../constants"
import type { ArticleSnapshot, CampaignPayload } from "../types/notification-types"
import { loadActiveAudience, loadRules } from "./audience"
import { effectiveRule, resolveDigest } from "./resolve-recipients"
import { NOTIFICATION_TEMPLATE_KEYS, ensureNotificationTemplate } from "./templates"

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_KEYS = { daily: "notify_digest_daily_last", weekly: "notify_digest_weekly_last" } as const

export type DigestKind = keyof typeof WINDOW_KEYS

export interface DigestResult {
    kind: DigestKind
    window: { from: string; to: string }
    articles: number
    recipients: number
    drafted: boolean
}

async function windowStart(kind: DigestKind, now: Date): Promise<Date> {
    const row = await prisma.systemSetting.findUnique({ where: { setting_key: WINDOW_KEYS[kind] }, select: { setting_value: true } })
    const stored = typeof row?.setting_value === "string" ? new Date(row.setting_value) : null
    if (stored && !Number.isNaN(stored.getTime())) return stored
    return new Date(now.getTime() - (kind === "daily" ? DAY_MS : 7 * DAY_MS))
}

async function saveWindowEnd(kind: DigestKind, to: Date) {
    await prisma.systemSetting.upsert({
        where: { setting_key: WINDOW_KEYS[kind] },
        update: { setting_value: to.toISOString() },
        create: { setting_key: WINDOW_KEYS[kind], setting_value: to.toISOString(), description: `Publication notifications: end of the last ${kind} digest window` },
    })
}

export async function buildDigest(kind: DigestKind, now = new Date()): Promise<DigestResult> {
    const from = await windowStart(kind, now)
    const window = { from: from.toISOString(), to: now.toISOString() }

    const candidates = await prisma.publicationEvent.findMany({
        where: { kind: "article", detected_at: { gt: from, lte: now } },
        orderBy: { published_at: "asc" },
    })
    // Leave out articles whose issue was announced on its own.
    const issueIds = [...new Set(candidates.map((e) => e.ojs_issue_id).filter((x): x is bigint => x !== null))]
    const announced = issueIds.length
        ? new Set((await prisma.publicationEvent.findMany({
            where: { kind: "issue", ojs_issue_id: { in: issueIds }, campaign_id: { not: null } },
            select: { ojs_issue_id: true },
        })).map((e) => String(e.ojs_issue_id)))
        : new Set<string>()
    const events = candidates.filter((e) => e.ojs_issue_id === null || !announced.has(String(e.ojs_issue_id)))

    const result: DigestResult = { kind, window, articles: events.length, recipients: 0, drafted: false }
    if (events.length) {
        const [rules, audience] = await Promise.all([loadRules(), loadActiveAudience()])
        const digestEvents = events.map((e) => {
            const snap = e.snapshot as unknown as ArticleSnapshot
            return {
                id: e.id,
                event_type: "article_digest" as const,
                journal_id: snap.journal_id ? BigInt(snap.journal_id) : null,
                discipline_ids: (e.discipline_ids as string[]).map(BigInt),
            }
        })
        // Auto-draft is controlled by the global digest rule (per-journal and
        // per-discipline rules still decide who receives which article).
        const gate = effectiveRule(rules, "article_digest", null, [])
        const perSubscriber = resolveDigest(digestEvents, audience, rules, kind as ArticleFrequency)
        result.recipients = perSubscriber.size

        if (gate.auto_draft && perSubscriber.size > 0) {
            const templateId = gate.template_id ?? await ensureNotificationTemplate(
                prisma,
                kind === "daily" ? NOTIFICATION_TEMPLATE_KEYS.dailyDigest : NOTIFICATION_TEMPLATE_KEYS.weeklyDigest,
            )
            const payload: CampaignPayload = { event_ids: events.map((e) => e.id.toString()), window }
            await prisma.notificationCampaign.create({
                data: {
                    type: kind === "daily" ? "digest_daily" : "digest_weekly",
                    status: "draft",
                    template_id: templateId,
                    payload: payload as unknown as Prisma.InputJsonValue,
                    recipient_estimate: perSubscriber.size,
                },
            })
            result.drafted = true
        }
    }
    await saveWindowEnd(kind, now)
    return result
}

/** The 07:00 cron: daily every day, weekly on Mondays (UTC). */
export async function runDigests(now = new Date()): Promise<DigestResult[]> {
    const out = [await buildDigest("daily", now)]
    if (now.getUTCDay() === 1) out.push(await buildDigest("weekly", now))
    return out
}
