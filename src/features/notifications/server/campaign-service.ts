/**
 * Admin campaign review (#202): list, detail with audience breakdown,
 * preview, draft edits, test send and approval. Approval re-resolves the
 * audience (so unsubscribes since drafting are honoured) and creates the
 * delivery rows that the send cron (#201) works through.
 */

import { Prisma, type NotificationCampaign } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import { getNotificationTransport } from "@/src/lib/email/notification-transport"
import { cleanSenderName, defaultSenderName } from "@/src/lib/email/sender-display-name"

import type { CampaignPayload, IssueSnapshot, ArticleSnapshot } from "../types/notification-types"
import { loadActiveAudience, loadRules } from "./audience"
import { composeMessage, loadComposeContext, type ComposeSubscriber } from "./compose"
import { resolveDigest, resolveRecipients, type AudienceSubscriber } from "./resolve-recipients"
import { automaticSenderName } from "./sender-name"
import { sendToEach, type TestSendResult } from "./test-send-budget"
import { assertContentOk } from "./content-guard"
import { customAudienceIds, templateUsage } from "./custom-campaign-service"

const DELIVERY_CHUNK = 1000

export class CampaignStateError extends Error {}

// ─── Read ─────────────────────────────────────────────────────────────

export async function listCampaigns(q: { status?: string; type?: string }, offset: number, limit: number) {
    const where: Prisma.NotificationCampaignWhereInput = {}
    if (q.status) where.status = q.status
    if (q.type) where.type = q.type
    const [rows, total] = await Promise.all([
        prisma.notificationCampaign.findMany({
            where,
            orderBy: { created_at: "desc" },
            skip: offset,
            take: limit,
            include: { template: { select: { name: true, subject: true } } },
        }),
        prisma.notificationCampaign.count({ where }),
    ])
    return {
        total,
        rows: rows.map(({ template, payload: _p, ...c }) => ({ ...c, subject: c.subject_override || template.subject, template_name: template.name })),
    }
}

function payloadOf(c: NotificationCampaign): CampaignPayload {
    return (c.payload ?? {}) as unknown as CampaignPayload
}

/** Audience as subscriber ids for any campaign type (approval and breakdown share it). */
async function resolveCampaignAudience(c: NotificationCampaign): Promise<{ ids: bigint[]; audience: AudienceSubscriber[] }> {
    const payload = payloadOf(c)
    if (c.type === "custom") {
        const ids = await customAudienceIds(payload.audience)
        const chosen = new Set(ids.map(String))
        // The full active audience only feeds the journal/discipline breakdown.
        const audience = (await loadActiveAudience()).filter((s) => chosen.has(String(s.id)))
        return { ids, audience }
    }
    if (c.type === "invitation") {
        if (!payload.import_id) return { ids: [], audience: [] }
        const rows = await prisma.notificationSubscriber.findMany({
            where: { import_id: BigInt(payload.import_id), status: "pending" },
            select: { id: true },
        })
        return { ids: rows.map((r) => r.id), audience: [] }
    }
    const excluded = new Set(payload.excluded_event_ids ?? [])
    const eventIds = (payload.event_ids ?? []).filter((id) => !excluded.has(id)).map(BigInt)
    if (!eventIds.length) return { ids: [], audience: [] }
    const [rules, audience, events] = await Promise.all([
        loadRules(),
        loadActiveAudience(),
        prisma.publicationEvent.findMany({ where: { id: { in: eventIds } } }),
    ])
    const toEvent = (e: (typeof events)[number], type: "issue_published" | "article_digest") => {
        const snap = e.snapshot as unknown as { journal_id: string | null }
        return { id: e.id, event_type: type, journal_id: snap.journal_id ? BigInt(snap.journal_id) : null, discipline_ids: (e.discipline_ids as string[]).map(BigInt) }
    }
    if (c.type === "issue") {
        const issue = events.find((e) => e.kind === "issue")
        return { ids: issue ? resolveRecipients(toEvent(issue, "issue_published"), audience, rules) : [], audience }
    }
    if (c.type === "digest_daily" || c.type === "digest_weekly") {
        const per = resolveDigest(events.map((e) => toEvent(e, "article_digest")), audience, rules, c.type === "digest_daily" ? "daily" : "weekly")
        return { ids: [...per.keys()], audience }
    }
    return { ids: [], audience }
}

export async function getCampaignDetail(id: bigint) {
    const c = await prisma.notificationCampaign.findUnique({
        where: { id },
        include: {
            template: { select: { id: true, name: true, subject: true, html_content: true, text_content: true } },
            approver: { select: { full_name: true, email: true } },
        },
    })
    if (!c) return null
    const payload = payloadOf(c)
    const usage = c.status === "draft" ? await templateUsage(c.template_id, c.id) : null
    const eventIds = (payload.event_ids ?? []).map(BigInt)
    const events = eventIds.length
        ? await prisma.publicationEvent.findMany({ where: { id: { in: eventIds } }, orderBy: { published_at: "asc" } })
        : []

    const { ids, audience } = await resolveCampaignAudience(c)
    const chosen = new Set(ids.map(String))
    const byJournal = new Map<string, number>()
    const byDiscipline = new Map<string, number>()
    for (const s of audience) {
        if (!chosen.has(String(s.id))) continue
        for (const j of s.journal_ids) byJournal.set(String(j), (byJournal.get(String(j)) ?? 0) + 1)
        for (const d of s.discipline_ids) byDiscipline.set(String(d), (byDiscipline.get(String(d)) ?? 0) + 1)
    }
    const [journals, disciplines] = await Promise.all([
        byJournal.size ? prisma.journal.findMany({ where: { id: { in: [...byJournal.keys()].map(BigInt) } }, select: { id: true, title: true } }) : [],
        byDiscipline.size ? prisma.discipline.findMany({ where: { id: { in: [...byDiscipline.keys()].map(BigInt) } }, select: { id: true, name: true } }) : [],
    ])
    const top = (m: Map<string, number>, names: Map<string, string>) =>
        [...m.entries()].map(([k, count]) => ({ id: k, name: names.get(k) ?? k, count })).sort((a, b) => b.count - a.count).slice(0, 20)

    const excluded = new Set(payload.excluded_event_ids ?? [])
    const { payload: _p, ...campaign } = c
    return {
        campaign: {
            ...campaign,
            subject: c.subject_override || c.template.subject,
            editor_note: payload.editor_note ?? null,
            window: payload.window ?? null,
            from_name: payload.from_name ?? null,
            /** What the inbox shows when from_name is empty. */
            automatic_from_name: (await automaticSenderName(c, events)) || defaultSenderName(),
            audience: payload.audience ?? null,
            message_heading: payload.message_heading ?? null,
            message: payload.message ?? null,
            /** Other rules and drafts using this template (shown before overwriting it). */
            template_usage: usage,
        },
        events: events.map((e) => {
            const snap = e.snapshot as unknown as Partial<IssueSnapshot & ArticleSnapshot>
            return {
                id: e.id,
                kind: e.kind,
                title: snap.title ?? null,
                journal_title: snap.journal_title ?? null,
                published_at: e.published_at,
                url: snap.url ?? null,
                excluded: excluded.has(e.id.toString()),
            }
        }),
        recipients: {
            total: ids.length,
            by_journal: top(byJournal, new Map(journals.map((j) => [String(j.id), j.title]))),
            by_discipline: top(byDiscipline, new Map(disciplines.map((d) => [String(d.id), d.name]))),
        },
    }
}

// ─── Preview & test ───────────────────────────────────────────────────

/** A stand-in recipient for previews and test sends: sees every article, links are inert. */
function sampleRecipient(email: string, name: string, audienceFor: NotificationCampaign): ComposeSubscriber {
    return {
        id: BigInt(0),
        email,
        name,
        status: audienceFor.type === "invitation" ? "pending" : "active",
        token_version: 0,
        issue_alerts: true,
        article_frequency: audienceFor.type === "digest_daily" ? "daily" : "weekly",
        journal_ids: [],
        discipline_ids: [],
    }
}

/** One sample message per address, from a single compose context. */
async function composeSamples(c: NotificationCampaign, recipients: readonly string[], name: string) {
    const ctx = await loadComposeContext(c, [])
    // Follow every journal in a digest so the sample shows all articles.
    const digestJournals = c.type === "digest_daily" || c.type === "digest_weekly"
        ? [...ctx.events.values()].map((e) => (e.snapshot as unknown as ArticleSnapshot).journal_id).filter((x): x is string => !!x).map(BigInt)
        : []
    const messages = []
    for (const to of recipients) {
        const sample = sampleRecipient(to, name, c)
        sample.journal_ids = digestJournals
        messages.push(await composeMessage(ctx, sample))
    }
    return messages
}

async function composeSample(c: NotificationCampaign, to: string, name: string) {
    return (await composeSamples(c, [to], name))[0]
}

export async function previewCampaign(id: bigint) {
    const c = await prisma.notificationCampaign.findUnique({ where: { id } })
    if (!c) return null
    const m = await composeSample(c, "preview@example.org", "Dr Jane Doe")
    return m ? { subject: m.subject, html: m.html, text: m.text } : { subject: "", html: "<p>No content: every item was removed.</p>", text: "" }
}

/** Sends the draft, exactly as subscribers will get it but with a [TEST] subject, to each address. */
export async function sendCampaignTest(id: bigint, recipients: readonly string[], name: string): Promise<TestSendResult | null> {
    const c = await prisma.notificationCampaign.findUnique({ where: { id } })
    if (!c) return null
    const messages = await composeSamples(c, recipients, name)
    if (messages.some((m) => !m)) throw new CampaignStateError("Nothing to send: every item was removed from this draft.")
    const transport = getNotificationTransport()
    return sendToEach(recipients, (to) => {
        const m = messages[recipients.indexOf(to)]!
        return transport.send({ ...m, subject: `[TEST] ${m.subject}` })
    })
}

// ─── Edit & approve ───────────────────────────────────────────────────

export interface CampaignEdit {
    subject_override?: string | null
    editor_note?: string | null
    excluded_event_ids?: string[]
    from_name?: string | null
    /** Custom messages only. */
    message_heading?: string | null
    message?: string | null
    /** Edited content for this campaign; null restores the template's. */
    html_override?: string | null
    text_override?: string | null
}

export async function updateDraft(id: bigint, edit: CampaignEdit) {
    const c = await prisma.notificationCampaign.findUnique({ where: { id } })
    if (!c) return null
    if (c.status !== "draft") throw new CampaignStateError("Only drafts can be edited.")
    const payload = payloadOf(c)
    const next: CampaignPayload = { ...payload }
    if (edit.editor_note !== undefined) next.editor_note = edit.editor_note || null
    if (edit.from_name !== undefined) next.from_name = cleanSenderName(edit.from_name) || null
    if (c.type === "custom") {
        if (edit.message_heading !== undefined) next.message_heading = edit.message_heading?.trim() || null
        if (edit.message !== undefined) next.message = edit.message?.trim() || null
    }
    const overrides: { html_override?: string | null; text_override?: string | null } = {}
    if (edit.html_override !== undefined) overrides.html_override = edit.html_override?.trim() ? edit.html_override : null
    if (edit.text_override !== undefined) overrides.text_override = edit.text_override?.trim() ? edit.text_override : null
    if (overrides.html_override || overrides.text_override) {
        const template = await prisma.emailTemplate.findUniqueOrThrow({ where: { id: c.template_id }, select: { html_content: true, text_content: true } })
        const html = overrides.html_override !== undefined ? overrides.html_override : c.html_override
        const text = overrides.text_override !== undefined ? overrides.text_override : c.text_override
        assertContentOk(html ?? template.html_content, text ?? template.text_content)
    }
    if (edit.excluded_event_ids !== undefined) {
        const known = new Set(payload.event_ids ?? [])
        next.excluded_event_ids = edit.excluded_event_ids.filter((e) => known.has(e))
    }
    const updated = await prisma.notificationCampaign.update({
        where: { id },
        data: {
            ...(edit.subject_override !== undefined ? { subject_override: edit.subject_override || null } : {}),
            ...overrides,
            payload: next as unknown as Prisma.InputJsonValue,
        },
    })
    const { ids } = await resolveCampaignAudience(updated)
    await prisma.notificationCampaign.update({ where: { id }, data: { recipient_estimate: ids.length } })
    return { id: updated.id, recipient_estimate: ids.length }
}

/**
 * Approves a draft: resolves the audience again, creates one delivery per
 * recipient and queues the campaign (or schedules it). The status claim is
 * atomic, so a double click cannot create two queues.
 */
export async function approveCampaign(id: bigint, adminId: bigint, scheduledAt?: Date | null) {
    const c = await prisma.notificationCampaign.findUnique({ where: { id } })
    if (!c) return null
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) throw new CampaignStateError("The schedule time must be in the future.")

    const claimed = await prisma.notificationCampaign.updateMany({
        where: { id, status: "draft" },
        data: { status: "approving", approved_by: adminId, approved_at: new Date() },
    })
    if (!claimed.count) throw new CampaignStateError("Only drafts can be approved.")

    try {
        const { ids } = await resolveCampaignAudience(c)
        for (let i = 0; i < ids.length; i += DELIVERY_CHUNK) {
            await prisma.notificationDelivery.createMany({
                data: ids.slice(i, i + DELIVERY_CHUNK).map((subscriber_id) => ({ campaign_id: id, subscriber_id })),
                skipDuplicates: true,
            })
        }
        const status = ids.length === 0 ? "sent" : scheduledAt ? "scheduled" : "queued"
        await prisma.notificationCampaign.update({
            where: { id },
            data: { status, scheduled_at: scheduledAt ?? null, recipient_estimate: ids.length },
        })
        return { status, recipients: ids.length }
    } catch (e) {
        // Back to draft so the admin can retry; any rows created are reused (skipDuplicates).
        await prisma.notificationCampaign.update({ where: { id }, data: { status: "draft", approved_by: null, approved_at: null } })
        throw e
    }
}

// ─── Overview ─────────────────────────────────────────────────────────

export async function getOverview() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const [byStatus, sent7d, drafts, recent] = await Promise.all([
        prisma.notificationSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.notificationDelivery.count({ where: { status: "sent", sent_at: { gt: weekAgo } } }),
        prisma.notificationCampaign.count({ where: { status: "draft" } }),
        listCampaigns({}, 0, 5),
    ])
    const counts = Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])) as Record<string, number>
    return {
        subscribers: {
            active: counts.active ?? 0,
            pending: counts.pending ?? 0,
            suppressed: (counts.unsubscribed ?? 0) + (counts.bounced ?? 0) + (counts.complained ?? 0),
        },
        sent_7d: sent7d,
        drafts_awaiting: drafts,
        recent_campaigns: recent.rows,
    }
}
