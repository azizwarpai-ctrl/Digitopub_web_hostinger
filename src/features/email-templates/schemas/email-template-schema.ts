import { z } from "zod"

/** {{{name}}} (raw HTML) is only allowed for server-built notification blocks. */
const RAW_ALLOWED = ["toc_html", "articles_html"]
const rawVariablesOk = (html: string | undefined | null) =>
  !html || [...html.matchAll(/\{\{\{(\w+)\}\}\}/g)].every((m) => RAW_ALLOWED.includes(m[1]))
const RAW_MESSAGE = `Triple braces {{{…}}} are only allowed for: ${RAW_ALLOWED.join(", ")}. Use {{name}} for everything else.`

export const emailTemplateCreateSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less")
    .regex(/^[a-z0-9_-]+$/, "Name must be lowercase alphanumeric with hyphens/underscores"),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  html_content: z.string().trim().min(1, "HTML content is required"),
  text_content: z.string().optional(),
  variables: z.array(z.string()).optional(),
  description: z.string().max(2000).optional(),
  is_active: z.boolean().optional().default(true),
  category: z.enum(["transactional", "notification"]).optional(),
}).refine((v) => rawVariablesOk(v.html_content), { message: RAW_MESSAGE, path: ["html_content"] })

export const emailTemplateUpdateSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100)
    .regex(/^[a-z0-9_-]+$/, "Name must be lowercase alphanumeric with hyphens/underscores")
    .optional(),
  subject: z.string().trim().min(1).max(500).optional(),
  html_content: z.string().trim().min(1).optional(),
  text_content: z.string().nullable().optional(),
  variables: z.array(z.string()).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  category: z.enum(["transactional", "notification"]).optional(),
}).refine((v) => rawVariablesOk(v.html_content), { message: RAW_MESSAGE, path: ["html_content"] })

export const emailTemplateIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "Invalid template ID"),
})

export const emailTemplatePreviewSchema = z.object({
  variables: z.record(z.string(), z.string()).optional().default({}),
})

export const emailTemplateSendTestSchema = z.object({
  to: z.email("Invalid email address"),
  variables: z.record(z.string(), z.string()).optional().default({}),
})

export type EmailTemplateCreate = z.infer<typeof emailTemplateCreateSchema>
export type EmailTemplateUpdate = z.infer<typeof emailTemplateUpdateSchema>

/**
 * Shared type for use in form components (both New and Edit)
 * This ensures that common fields are accessible with consistent types.
 */
export type EmailTemplateFormValues = {
  name: string
  subject: string
  html_content: string
  text_content?: string | null
  description?: string | null
  is_active: boolean
}

