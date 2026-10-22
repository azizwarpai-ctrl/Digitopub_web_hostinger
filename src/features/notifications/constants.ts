/**
 * Allowed values for the VARCHAR status-like columns on the notification
 * models (see prisma/schema.prisma). The schema uses plain strings, like the
 * rest of the codebase, so these arrays are the single source of truth for
 * Zod validation and TypeScript unions.
 */

export const SUBSCRIBER_STATUSES = ["pending", "active", "unsubscribed", "bounced", "complained"] as const
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number]

/** Statuses that must never be re-invited or re-subscribed by an import. */
export const SUPPRESSED_STATUSES = ["unsubscribed", "bounced", "complained"] as const satisfies readonly SubscriberStatus[]

export const SUBSCRIBER_SOURCES = ["import", "public_form", "orcid_account", "admin_manual"] as const
export type SubscriberSource = (typeof SUBSCRIBER_SOURCES)[number]

export const ARTICLE_FREQUENCIES = ["weekly", "daily", "off"] as const
export type ArticleFrequency = (typeof ARTICLE_FREQUENCIES)[number]

export const IMPORT_STATUSES = ["parsed", "confirmed", "cancelled", "failed"] as const
export type ImportStatus = (typeof IMPORT_STATUSES)[number]

export const IMPORT_ROW_ISSUES = ["invalid_email", "duplicate_in_file", "exists", "suppressed"] as const
export type ImportRowIssue = (typeof IMPORT_ROW_ISSUES)[number]

export const RULE_SCOPES = ["global", "journal", "discipline"] as const
export type RuleScope = (typeof RULE_SCOPES)[number]

export const RULE_EVENT_TYPES = ["issue_published", "article_digest"] as const
export type RuleEventType = (typeof RULE_EVENT_TYPES)[number]

export const PUBLICATION_EVENT_KINDS = ["issue", "article"] as const
export type PublicationEventKind = (typeof PUBLICATION_EVENT_KINDS)[number]

export const CAMPAIGN_TYPES = ["issue", "digest_weekly", "digest_daily", "invitation", "custom"] as const
export type CampaignType = (typeof CAMPAIGN_TYPES)[number]

export const CAMPAIGN_STATUSES = ["draft", "approving", "scheduled", "queued", "sending", "paused", "sent", "cancelled", "failed"] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const DELIVERY_STATUSES = ["queued", "sent", "failed", "skipped"] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const EMAIL_TEMPLATE_CATEGORIES = ["transactional", "notification"] as const
export type EmailTemplateCategory = (typeof EMAIL_TEMPLATE_CATEGORIES)[number]

/** `NotificationRule.scope_key`: one rule per (scope target, event type). */
export function ruleScopeKey(scope: RuleScope, targetId?: bigint | number | string | null): string {
    if (scope === "global") return "global"
    if (targetId === null || targetId === undefined || targetId === "") {
        throw new Error(`ruleScopeKey: scope "${scope}" requires a target id`)
    }
    return `${scope}:${targetId}`
}

/** `PublicationEvent.dedupe_key`: issues by issue id, articles by submission id. */
export function publicationDedupeKey(kind: PublicationEventKind, ojsId: bigint | number | string): string {
    return `${kind}:${ojsId}`
}
