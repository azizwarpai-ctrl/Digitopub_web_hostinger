import { z } from "zod"

import {
    ARTICLE_FREQUENCIES,
    IMPORT_ROW_ISSUES,
    SUBSCRIBER_SOURCES,
    SUBSCRIBER_STATUSES,
    SUPPRESSED_STATUSES,
} from "../constants"

const idString = z.string().regex(/^\d+$/, "Invalid ID")

export const idParamSchema = z.object({ id: idString })

/** Column map sent with an upload (multipart field `column_map`, JSON-encoded). */
export const columnMapSchema = z.object({
    email: z.number().int().min(0),
    name: z.number().int().min(0).optional(),
    first_name: z.number().int().min(0).optional(),
    last_name: z.number().int().min(0).optional(),
    interests: z.number().int().min(0).optional(),
})

export const importRowsQuerySchema = z.object({
    issue: z.enum([...IMPORT_ROW_ISSUES, "valid", "unmapped"]).optional(),
})

export const termMappingSchema = z.object({
    mappings: z
        .array(z.object({ term: z.string().trim().min(1).max(150), discipline_id: idString }))
        .min(1)
        .max(500),
})

export const subscriberListQuerySchema = z.object({
    status: z.enum(SUBSCRIBER_STATUSES).optional(),
    source: z.enum(SUBSCRIBER_SOURCES).optional(),
    discipline_id: idString.optional(),
    journal_id: idString.optional(),
    q: z.string().trim().max(255).optional(),
})

export const subscriberCreateSchema = z.object({
    email: z.email().max(255),
    name: z.string().trim().max(255).optional(),
    affiliation: z.string().trim().max(255).optional(),
    discipline_ids: z.array(idString).max(200).optional(),
    journal_ids: z.array(idString).max(200).optional(),
})

/**
 * Admins may edit details and interests, and may suppress a subscriber
 * (unsubscribed / bounced / complained). They can never activate one or
 * revert a suppression: activation requires the subscriber's own consent.
 */
export const subscriberUpdateSchema = z.object({
    name: z.string().trim().max(255).nullable().optional(),
    affiliation: z.string().trim().max(255).nullable().optional(),
    article_frequency: z.enum(ARTICLE_FREQUENCIES).optional(),
    issue_alerts: z.boolean().optional(),
    status: z.enum(SUPPRESSED_STATUSES).optional(),
    discipline_ids: z.array(idString).max(200).optional(),
    journal_ids: z.array(idString).max(200).optional(),
})

export type ColumnMapInput = z.infer<typeof columnMapSchema>
export type SubscriberListQuery = z.infer<typeof subscriberListQuerySchema>
export type SubscriberCreateInput = z.infer<typeof subscriberCreateSchema>
export type SubscriberUpdateInput = z.infer<typeof subscriberUpdateSchema>

// ─── Public (#199) ────────────────────────────────────────────────────

/** Names are rendered into emails; the renderer escapes nothing until #202, so markup characters are refused. */
const publicName = z
    .string()
    .trim()
    .max(120)
    .regex(/^[^<>"&]*$/, "Name contains unsupported characters")

const tokenString = z.string().min(20).max(512)

export const publicSubscribeSchema = z.object({
    email: z.email().max(255),
    name: publicName.optional(),
    journal_ids: z.array(idString).max(50).default([]),
    discipline_ids: z.array(idString).max(100).default([]),
    /** Honeypot: real browsers leave it empty. */
    website: z.string().max(200).optional(),
})

export const tokenBodySchema = z.object({ token: tokenString })

export const preferencesSchema = z.object({
    token: tokenString,
    journal_ids: z.array(idString).max(50),
    discipline_ids: z.array(idString).max(100),
    article_frequency: z.enum(ARTICLE_FREQUENCIES),
    issue_alerts: z.boolean(),
    resume: z.boolean().optional(),
})

export const accountSubscribeSchema = publicSubscribeSchema.omit({ website: true })

export type PublicSubscribeInput = z.infer<typeof publicSubscribeSchema>
export type PreferencesBody = z.infer<typeof preferencesSchema>

// ─── Admin campaigns & configuration (#202) ───────────────────────────

export const campaignListQuerySchema = z.object({
    status: z.string().max(20).optional(),
    type: z.string().max(20).optional(),
})

export const campaignEditSchema = z.object({
    subject_override: z.string().trim().max(500).nullable().optional(),
    editor_note: z.string().trim().max(2000).nullable().optional(),
    excluded_event_ids: z.array(idString).max(1000).optional(),
})

export const campaignApproveSchema = z.object({
    /** ISO date-time; omitted = send now. */
    scheduled_at: z.iso.datetime({ offset: true }).optional(),
})

export const campaignTestSchema = z.object({ to: z.email().max(255).optional() })

export const ruleUpsertSchema = z.object({
    scope: z.enum(["global", "journal", "discipline"]),
    journal_id: idString.nullable().optional(),
    discipline_id: idString.nullable().optional(),
    event_type: z.enum(["issue_published", "article_digest"]),
    enabled: z.boolean(),
    auto_draft: z.boolean(),
    template_id: idString.nullable().optional(),
})

export const disciplineCreateSchema = z.object({
    name: z.string().trim().min(1).max(150),
    slug: z.string().trim().max(100).optional(),
    parent_id: idString.nullable().optional(),
    synonyms: z.array(z.string().trim().max(150)).max(200).optional(),
})

export const disciplineUpdateSchema = z.object({
    name: z.string().trim().min(1).max(150).optional(),
    parent_id: idString.nullable().optional(),
    synonyms: z.array(z.string().trim().max(150)).max(200).optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(10_000).optional(),
})

export const disciplineIdsSchema = z.object({ discipline_ids: z.array(idString).max(200) })

export const settingsSchema = z.object({
    publisher_address: z.string().trim().max(500).optional(),
    weekly_digest_day: z.number().int().min(0).max(6).optional(),
    consent_text_version: z.string().trim().min(1).max(32).optional(),
})
