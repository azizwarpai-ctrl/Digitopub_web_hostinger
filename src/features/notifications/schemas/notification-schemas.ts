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
