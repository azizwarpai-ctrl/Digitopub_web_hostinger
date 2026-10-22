/**
 * Which display name a campaign is sent under. Messages about one journal
 * (its issue alerts, invitations for a list assigned to it, messages to its
 * members) carry the journal's title; everything else uses the default
 * ("DigitoPub", or NOTIFY_FROM_NAME). An admin can override it per draft.
 * Only the name changes: the address is always the alerts mailbox.
 */

import type { NotificationCampaign, PublicationEvent } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import { cleanSenderName } from "@/src/lib/email/sender-display-name"

import type { CampaignPayload, IssueSnapshot } from "../types/notification-types"

/** Title of the campaign's journal (`payload.journal_id`), or null. */
export async function campaignJournalTitle(campaign: Pick<NotificationCampaign, "payload">): Promise<string | null> {
    const id = ((campaign.payload ?? {}) as CampaignPayload).journal_id
    if (!id) return null
    const journal = await prisma.journal.findUnique({ where: { id: BigInt(id) }, select: { title: true } })
    return journal?.title ?? null
}

/**
 * The automatic sender name, or null for the default. Pass `journalTitle`
 * when it is already loaded to skip the lookup.
 */
export async function automaticSenderName(
    campaign: Pick<NotificationCampaign, "type" | "payload">,
    events: Iterable<PublicationEvent> = [],
    journalTitle?: string | null,
): Promise<string | null> {
    const payload = (campaign.payload ?? {}) as CampaignPayload
    if (campaign.type === "issue") {
        for (const e of events) {
            const title = e.kind === "issue" ? (e.snapshot as unknown as IssueSnapshot).journal_title : null
            if (title) return cleanSenderName(title) || null
        }
    }
    if (!payload.journal_id) return null
    return cleanSenderName(journalTitle === undefined ? await campaignJournalTitle(campaign) : journalTitle) || null
}

/** The admin's choice when set, otherwise the automatic name (null = default). */
export async function senderNameFor(
    campaign: Pick<NotificationCampaign, "type" | "payload">,
    events: Iterable<PublicationEvent> = [],
    journalTitle?: string | null,
): Promise<string | null> {
    const chosen = cleanSenderName(((campaign.payload ?? {}) as CampaignPayload).from_name)
    return chosen || automaticSenderName(campaign, events, journalTitle)
}
