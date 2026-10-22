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
