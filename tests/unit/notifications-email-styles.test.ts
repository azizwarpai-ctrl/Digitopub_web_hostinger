import { createHash } from "node:crypto"

import { describe, it, expect } from "vitest"

import { EMAIL_STYLES, EMAIL_STYLE_KEYS, getEmailStyle } from "@/src/features/notifications/server/email-styles"
import { TEMPLATE_SET, buildTemplateSet } from "@/src/features/notifications/server/template-set"
import { NOTIFICATION_TEMPLATE_KEYS, getDefaultTemplate } from "@/src/features/notifications/server/templates"
import { sampleVariables } from "@/src/features/notifications/server/sample-data"
import { RAW_BLOCK_VARIABLES, buildEditorNote } from "@/src/features/notifications/server/render-blocks"
import { STYLE_PREVIEW_TEMPLATES } from "@/src/features/notifications/schemas/notification-schemas"
import { extractAllVariables, renderHtmlTemplate, renderTemplate } from "@/src/lib/email/renderer"

const sha = (s: string) => createHash("sha256").update(s).digest("hex")

/** HTML of the shipped set before the style gallery: Classic must not change by a byte. */
const CLASSIC_HTML_SHA256: Record<string, string> = {
    notify_subscription_confirm: "8f21b7bcaa577d5b236afe325910b4db167f261e7f3f77276dd912fd41b471f0",
    notify_import_invitation: "9ed62f6a83e913bc005308457e660039404af7c6bd523e3bc071523fe0d2f9ec",
    notify_welcome: "422bee2d79944e228c3d59c512fa434fed4c7a0f90f97f2cb02eb003d5fe816b",
    notify_new_issue: "acc4ecd1c3cd2318235c5df72afb648ca1f985fcba1296afcbb42af87fd4a59f",
    notify_weekly_digest: "7d899d367340c8b3eb3d632053dd5dc568d5cf0f36a37fe828333fa1ff920c05",
    notify_daily_digest: "731eb0eabbae9edf4b0b1a274d35d32601e965c900a6291a75af26d59797a423",
    notify_preferences_updated: "51e82c86f21735596ac541fbefae520ce3c4f9462e437c47e9422ef93757a5cc",
}

const cases = EMAIL_STYLE_KEYS.flatMap((key) =>
    Object.entries(buildTemplateSet(EMAIL_STYLES[key])).map(([name, t]) => [key, name, t] as const),
)

describe("email style gallery: styles", () => {
    it("keeps the Classic set byte-identical to the pre-gallery templates", () => {
        for (const [name, hash] of Object.entries(CLASSIC_HTML_SHA256)) expect(sha(TEMPLATE_SET[name].html_content), name).toBe(hash)
    })

    it("only changes the HTML: subjects, text parts and variables are the same in every style", () => {
        for (const key of EMAIL_STYLE_KEYS) {
            const set = buildTemplateSet(EMAIL_STYLES[key])
            for (const [name, t] of Object.entries(TEMPLATE_SET)) {
                expect(set[name].subject).toBe(t.subject)
                expect(set[name].text_content).toBe(t.text_content)
                expect(set[name].variables).toEqual(t.variables)
            }
        }
    })

    it("gives each style a distinct design", () => {
        const html = EMAIL_STYLE_KEYS.map((k) => buildTemplateSet(EMAIL_STYLES[k]).notify_new_issue.html_content)
        expect(new Set(html).size).toBe(EMAIL_STYLE_KEYS.length)
    })

    it.each(cases)("%s / %s declares its variables and renders cleanly with styled blocks", (key, name, t) => {
        for (const v of extractAllVariables(t.html_content, t.subject, t.text_content)) expect(t.variables).toContain(v)
        const vars = sampleVariables(name, EMAIL_STYLES[key])
        expect(renderHtmlTemplate(t.html_content, vars, RAW_BLOCK_VARIABLES)).not.toMatch(/\{\{/)
        expect(renderTemplate(t.text_content, vars)).not.toMatch(/\{\{/)
    })

    it.each(cases)("%s / %s keeps the compliant footer, preheader and dark mode", (_key, name, t) => {
        expect(t.html_content).toContain('<html lang="en"')
        expect(t.html_content).toContain("{{preheader}}")
        expect(t.html_content).toContain("prefers-color-scheme: dark")
        expect(t.html_content).toContain('width="600"')
        expect(t.html_content).toContain("{{privacy_url}}")
        expect(t.html_content).toContain("{{publisher_address}}")
        if (name !== "notify_subscription_confirm") {
            expect(t.html_content).toContain("{{manage_url}}")
            expect(t.html_content).toContain("{{unsubscribe_url}}")
        }
        const visible = t.html_content.replace(/<!DOCTYPE[^>]*>/i, "").replace(/<style[\s\S]*?<\/style>/i, "").replace(/<[^>]+>/g, " ")
        expect(visible).not.toContain("!")
        for (const m of t.html_content.matchAll(/\{\{\{(\w+)\}\}\}/g)) {
            expect(RAW_BLOCK_VARIABLES as readonly string[]).toContain(m[1])
        }
    })

    it("draws the server-built blocks in the style, still escaped", () => {
        const note = buildEditorNote("A <b>note</b>", EMAIL_STYLES.modern)
        expect(note).toContain(EMAIL_STYLES.modern.colors.accent)
        expect(note).toContain("A &lt;b&gt;note&lt;/b&gt;")
        expect(sampleVariables("notify_new_issue", EMAIL_STYLES.minimal).toc_html).not.toContain("#1F3A5F")
    })

    it("falls back to Classic for unknown keys and serves defaults per style", () => {
        expect(getEmailStyle("neon").key).toBe("classic")
        expect(getEmailStyle(undefined).key).toBe("classic")
        expect(getDefaultTemplate("notify_welcome")?.html_content).toBe(TEMPLATE_SET.notify_welcome.html_content)
        expect(getDefaultTemplate("notify_welcome", EMAIL_STYLES.modern)?.html_content).toContain(EMAIL_STYLES.modern.colors.accent)
        expect(getDefaultTemplate("not_a_template", EMAIL_STYLES.modern)).toBeNull()
    })

    it("lists every notification template in the preview picker", () => {
        expect([...STYLE_PREVIEW_TEMPLATES].sort()).toEqual(Object.values(NOTIFICATION_TEMPLATE_KEYS).sort())
    })
})
