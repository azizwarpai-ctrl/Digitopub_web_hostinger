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

/** The automatic sender name, or null for the default. */
export async function automaticSenderName(
    campaign: Pick<NotificationCampaign, "type" | "payload">,
    events: Iterable<PublicationEvent> = [],
): Promise<string | null> {
    const payload = (campaign.payload ?? {}) as CampaignPayload
    if (campaign.type === "issue") {
        for (const e of events) {
            const title = e.kind === "issue" ? (e.snapshot as unknown as IssueSnapshot).journal_title : null
            if (title) return cleanSenderName(title) || null
        }
    }
    if (!payload.journal_id) return null
    const journal = await prisma.journal.findUnique({ where: { id: BigInt(payload.journal_id) }, select: { title: true } })
    return cleanSenderName(journal?.title) || null
}

/** The admin's choice when set, otherwise the automatic name (null = default). */
export async function senderNameFor(
    campaign: Pick<NotificationCampaign, "type" | "payload">,
    events: Iterable<PublicationEvent> = [],
): Promise<string | null> {
    const chosen = cleanSenderName(((campaign.payload ?? {}) as CampaignPayload).from_name)
    return chosen || automaticSenderName(campaign, events)
}
