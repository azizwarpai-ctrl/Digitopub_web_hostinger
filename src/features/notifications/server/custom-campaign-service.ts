/**
 * Admin-written messages (#218): "New message" campaigns with a chosen
 * audience, and turning a draft's edited content into a new template or
 * writing it back over its template. Drafts still need a test and an
 * approval before anything is sent.
 */

import { Prisma } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import { extractAllVariables } from "@/src/lib/email/renderer"
import { cleanSenderName } from "@/src/lib/email/sender-display-name"

import type { CampaignPayload, CustomAudience } from "../types/notification-types"
import { assertContentOk } from "./content-guard"
import { effectiveContent } from "./compose"
import { NOTIFICATION_TEMPLATE_KEYS, ensureNotificationTemplate } from "./templates"
import { getActiveEmailStyle } from "./admin-config-service"

export class CampaignInputError extends Error {}

/** At most this many hand-picked people per message. */
export const MAX_PICKED_PEOPLE = 500

/** Confirmed (active) subscribers in a custom audience. Pending, unsubscribed and suppressed people never qualify. */
export async function customAudienceIds(audience: CustomAudience | undefined): Promise<bigint[]> {
    if (!audience) return []
    const where: Prisma.NotificationSubscriberWhereInput = { status: "active" }
    switch (audience.kind) {
        case "all":
            break
        case "journal":
            where.journals = { some: { journal_id: BigInt(audience.journal_id) } }
            break
        case "people":
            if (!audience.subscriber_ids.length) return []
            where.id = { in: audience.subscriber_ids.slice(0, MAX_PICKED_PEOPLE).map(BigInt) }
            break
        case "import":
            where.import_id = BigInt(audience.import_id)
            break
        default:
            return []
    }
    const rows = await prisma.notificationSubscriber.findMany({ where, select: { id: true } })
    return rows.map((r) => r.id)
}

/** The journal a custom audience belongs to (its sender name), checking that the target exists. */
async function audienceJournal(audience: CustomAudience): Promise<bigint | null> {
    if (audience.kind === "journal") {
        const j = await prisma.journal.findUnique({ where: { id: BigInt(audience.journal_id) }, select: { id: true, status: true } })
        if (!j || j.status !== "active") throw new CampaignInputError("Choose an active journal.")
        return j.id
    }
    if (audience.kind === "import") {
        const imp = await prisma.subscriberImport.findUnique({ where: { id: BigInt(audience.import_id) }, select: { status: true, journal_id: true } })
        if (!imp || imp.status !== "confirmed") throw new CampaignInputError("Choose a confirmed uploaded list.")
        return imp.journal_id
    }
    if (audience.kind === "people" && audience.subscriber_ids.length === 0) throw new CampaignInputError("Pick at least one person.")
    return null
}

export interface CustomCampaignInput {
    audience: CustomAudience
    subject: string
    message_heading?: string | null
    message?: string | null
    from_name?: string | null
    /** A notification template to start from; the general-purpose letter when omitted. */
    template_id?: string | null
}

export async function createCustomCampaign(input: CustomCampaignInput) {
    const journalId = await audienceJournal(input.audience)
    let templateId: bigint
    if (input.template_id) {
        const t = await prisma.emailTemplate.findUnique({ where: { id: BigInt(input.template_id) }, select: { id: true, category: true } })
        if (t?.category !== "notification") throw new CampaignInputError("Choose a notification template.")
        templateId = t.id
    } else {
        templateId = await ensureNotificationTemplate(prisma, NOTIFICATION_TEMPLATE_KEYS.customMessage, await getActiveEmailStyle())
    }
    const audience: CustomAudience = input.audience.kind === "people"
        ? { kind: "people", subscriber_ids: [...new Set(input.audience.subscriber_ids)].slice(0, MAX_PICKED_PEOPLE) }
        : input.audience
    const payload: CampaignPayload = {
        audience,
        ...(journalId ? { journal_id: journalId.toString() } : {}),
        message_heading: input.message_heading?.trim() || null,
        message: input.message?.trim() || null,
        from_name: cleanSenderName(input.from_name) || null,
    }
    const ids = await customAudienceIds(audience)
    return prisma.notificationCampaign.create({
        data: {
            type: "custom",
            status: "draft",
            template_id: templateId,
            subject_override: input.subject.trim(),
            payload: payload as unknown as Prisma.InputJsonValue,
            recipient_estimate: ids.length,
        },
    })
}

async function loadDraftWithTemplate(id: bigint) {
    const c = await prisma.notificationCampaign.findUnique({ where: { id }, include: { template: true } })
    if (!c) return null
    if (c.status !== "draft") throw new CampaignInputError("Only drafts can be changed.")
    return c
}

/**
 * Saves the draft's current subject and content as a new notification
 * template, then points the draft at it (its own edits are now the template).
 */
export async function saveDraftAsTemplate(id: bigint, input: { name: string; description?: string | null }) {
    const c = await loadDraftWithTemplate(id)
    if (!c) return null
    const content = effectiveContent(c, c.template)
    assertContentOk(content.html, content.text)
    try {
        const template = await prisma.emailTemplate.create({
            data: {
                name: input.name,
                subject: content.subject,
                html_content: content.html,
                text_content: content.text,
                variables: extractAllVariables(content.html, content.subject, content.text ?? ""),
                description: input.description?.trim() || `Saved from campaign #${c.id}`,
                category: "notification",
                is_active: true,
            },
            select: { id: true, name: true },
        })
        await prisma.notificationCampaign.update({
            where: { id },
            data: { template_id: template.id, subject_override: null, html_override: null, text_override: null },
        })
        return template
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            throw new CampaignInputError(`A template named "${input.name}" already exists. Choose another name.`)
        }
        throw e
    }
}

/**
 * Writes the draft's current subject and content over its template, so
 * every future email that uses the template changes. The draft's own edits
 * are cleared because the template now holds them.
 */
export async function overwriteDraftTemplate(id: bigint) {
    const c = await loadDraftWithTemplate(id)
    if (!c) return null
    const content = effectiveContent(c, c.template)
    assertContentOk(content.html, content.text)
    const [template] = await prisma.$transaction([
        prisma.emailTemplate.update({
            where: { id: c.template_id },
            data: {
                subject: content.subject,
                html_content: content.html,
                text_content: content.text,
                variables: extractAllVariables(content.html, content.subject, content.text ?? ""),
            },
            select: { id: true, name: true },
        }),
        prisma.notificationCampaign.update({
            where: { id },
            data: { subject_override: null, html_override: null, text_override: null },
        }),
    ])
    return template
}

/** What else uses a template, shown before overwriting it. */
export async function templateUsage(templateId: bigint, exceptCampaignId: bigint) {
    const [rules, drafts] = await Promise.all([
        prisma.notificationRule.count({ where: { template_id: templateId } }),
        prisma.notificationCampaign.count({ where: { template_id: templateId, status: "draft", NOT: { id: exceptCampaignId } } }),
    ])
    return { rules, drafts }
}
