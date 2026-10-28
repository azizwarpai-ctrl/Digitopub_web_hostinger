import { describe, it, expect } from "vitest"

import { emailTemplateCreateSchema, emailTemplateUpdateSchema } from "@/src/features/email-templates/schemas/email-template-schema"
import { getDefaultTemplate } from "@/src/features/notifications/server/templates"
import { sampleVariables } from "@/src/features/notifications/server/sample-data"
import { renderHtmlTemplate, extractAllVariables } from "@/src/lib/email/renderer"
import { RAW_BLOCK_VARIABLES } from "@/src/features/notifications/server/render-blocks"

const base = { name: "notify_x", subject: "S", html_content: "<p>{{a}}</p>" }

describe("email template raw-variable guard (#202)", () => {
    it("allows {{{toc_html}}} and {{{articles_html}}} only", () => {
        expect(emailTemplateCreateSchema.safeParse({ ...base, html_content: "{{{toc_html}}}{{{articles_html}}}" }).success).toBe(true)
        expect(emailTemplateCreateSchema.safeParse({ ...base, html_content: "{{{recipient_name}}}" }).success).toBe(false)
        expect(emailTemplateUpdateSchema.safeParse({ html_content: "{{{journal_title}}}" }).success).toBe(false)
        expect(emailTemplateUpdateSchema.safeParse({ subject: "No html change" }).success).toBe(true)
    })
})

describe("shipped notification templates", () => {
    const names = [
        "notify_import_invitation", "notify_journal_invitation", "notify_subscription_confirm", "notify_welcome", "notify_preferences_updated",
        "notify_new_issue", "notify_weekly_digest", "notify_daily_digest",
    ]

    it.each(names)("%s renders with sample data and leaves no placeholder", (name) => {
        const t = getDefaultTemplate(name)!
        expect(t).toBeTruthy()
        const vars = sampleVariables(name)
        for (const v of extractAllVariables(t.html_content, t.subject, t.text_content)) expect(vars).toHaveProperty(v)
        const html = renderHtmlTemplate(t.html_content, vars, RAW_BLOCK_VARIABLES)
        expect(html).not.toMatch(/\{\{/)
        expect(emailTemplateCreateSchema.safeParse({ name, subject: t.subject, html_content: t.html_content }).success).toBe(true)
    })
})
