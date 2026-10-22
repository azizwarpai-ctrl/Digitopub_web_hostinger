import { describe, it, expect } from "vitest"

import { buildMessage } from "@/src/features/notifications/server/render-blocks"
import { contentProblems } from "@/src/features/notifications/server/content-guard"
import { EMAIL_STYLES } from "@/src/features/notifications/server/email-styles"
import { TEMPLATE_SET } from "@/src/features/notifications/server/template-set"

describe("admin message block", () => {
    it("escapes markup, keeps paragraphs and line breaks, and links http(s) URLs", () => {
        const { html, text } = buildMessage("Hello <b>all</b>\nline two\n\n\nSee https://digitopub.com/x?a=1&b=2. Thanks", EMAIL_STYLES.modern)
        expect(html).toContain("Hello &lt;b&gt;all&lt;/b&gt;<br>line two")
        expect(html.match(/<p /g)).toHaveLength(2)
        expect(html).toContain('<a href="https://digitopub.com/x?a=1&amp;b=2" style="color:#0F6E8C">https://digitopub.com/x?a=1&amp;b=2</a>. Thanks')
        expect(html).not.toContain("<b>")
        expect(text).toBe("Hello <b>all</b>\nline two\n\n\nSee https://digitopub.com/x?a=1&b=2. Thanks")
    })

    it("never links other schemes and returns nothing for an empty message", () => {
        expect(buildMessage("javascript:alert(1) and data:text/html,x").html).not.toContain("<a ")
        expect(buildMessage("  \n ")).toEqual({ html: "", text: "" })
        expect(buildMessage(null)).toEqual({ html: "", text: "" })
    })
})

describe("content guard", () => {
    const t = TEMPLATE_SET.notify_custom_message

    it("accepts the shipped letter", () => {
        expect(contentProblems(t.html_content, t.text_content)).toEqual([])
    })

    it("names every missing footer element and unsafe raw insertion", () => {
        const problems = contentProblems("<p>{{{recipient_name}}}</p>", "Hi")
        expect(problems.join(" ")).toMatch(/unsubscribe link/)
        expect(problems.join(" ")).toMatch(/manage-preferences link/)
        expect(problems.join(" ")).toMatch(/postal address/)
        expect(problems.join(" ")).toMatch(/plain-text version must keep/)
        expect(problems.join(" ")).toMatch(/found recipient_name/)
        expect(contentProblems("   ", null)).toContain("The HTML version is empty.")
    })
})
