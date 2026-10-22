import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { escapeHtml, renderHtmlTemplate, renderTemplate } from "@/src/lib/email/renderer"
import { classifySmtpError } from "@/src/lib/email/notification-transport"
import { computeBudget } from "@/src/features/notifications/server/send-service"
import { buildArticles, buildToc, RAW_BLOCK_VARIABLES } from "@/src/features/notifications/server/render-blocks"

describe("renderHtmlTemplate", () => {
    it("escapes {{var}} by default", () => {
        expect(renderHtmlTemplate("<p>{{t}}</p>", { t: `<script>x</script> & "q"` }))
            .toBe("<p>&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;</p>")
    })

    it("allows raw {{{var}}} only for allow-listed names", () => {
        const vars = { toc_html: "<table></table>", name: "<b>Eve</b>" }
        expect(renderHtmlTemplate("{{{toc_html}}}|{{{name}}}", vars, RAW_BLOCK_VARIABLES))
            .toBe("<table></table>|&lt;b&gt;Eve&lt;/b&gt;")
    })

    it("leaves unknown placeholders untouched, and the plain renderer unchanged", () => {
        expect(renderHtmlTemplate("{{missing}}", {})).toBe("{{missing}}")
        expect(renderTemplate("Hi {{n}} & co", { n: "<A>" })).toBe("Hi <A> & co")
        expect(escapeHtml("'")).toBe("&#39;")
    })
})

describe("computeBudget", () => {
    const limits = { perRun: 10, perHour: 60, perDay: 300 }
    it("takes the tightest of per-run, hourly and daily remaining", () => {
        expect(computeBudget(limits, 0, 0)).toBe(10)
        expect(computeBudget(limits, 55, 55)).toBe(5)
        expect(computeBudget(limits, 0, 296)).toBe(4)
        expect(computeBudget(limits, 70, 0)).toBe(0)
    })
})

describe("classifySmtpError", () => {
    it("treats 5xx as permanent and everything else as temporary", () => {
        expect(classifySmtpError({ responseCode: 550, message: "No such user" })).toEqual({ permanent: true, error: "550 No such user" })
        expect(classifySmtpError({ responseCode: 421, message: "Try later" }).permanent).toBe(false)
        expect(classifySmtpError({ code: "ECONNRESET" })).toEqual({ permanent: false, error: "ECONNRESET" })
    })
})

describe("render blocks", () => {
    const a = {
        title: `Aligners <b>& retention</b>`, authors: [{ name: "Ada <Lovelace>" }], doi: "10.1/x", section: "Research",
        is_open_access: true, url: "javascript:alert(1)",
    }
    it("escapes OJS values and neutralises non-http links in the TOC", () => {
        const toc = buildToc({ title: null, volume: 1, number: "1", year: 2026, cover_url: null, journal_title: "J", journal_issn: null, journal_id: null, url: "https://x", articles: [a] })
        expect(toc.html).toContain("Aligners &lt;b&gt;&amp; retention&lt;/b&gt;")
        expect(toc.html).toContain("Ada &lt;Lovelace&gt;")
        expect(toc.html).toContain('href="#"')
        expect(toc.html).not.toContain("<b>")
        expect(toc.text).toContain("RESEARCH")
    })

    it("groups digest articles by discipline", () => {
        const snap = { ...a, url: "https://x/a", abstract_excerpt: "Short.", keywords: [], section_id: null, journal_title: "J", journal_id: null, issue_id: null, publication_id: 1 }
        const out = buildArticles([{ snapshot: snap, disciplineName: "Orthodontics" }, { snapshot: snap, disciplineName: null }])
        expect(out.html).toContain("Orthodontics")
        expect(out.html).toContain("Other research")
        expect(out.text).toContain("Short.")
    })
})

describe("notification SMTP config", () => {
    it("falls back to SMTP_* when NOTIFY_SMTP_* is blank", async () => {
        const { isNotificationSmtpConfigured, notificationFromAddress } = await import("@/src/lib/email/notification-transport")
        const saved = { ...process.env }
        Object.assign(process.env, {
            NOTIFY_SMTP_HOST: "", NOTIFY_SMTP_USER: "", NOTIFY_SMTP_PASSWORD: "", NOTIFY_SMTP_FROM_EMAIL: "",
            SMTP_HOST: "smtp.example.org", SMTP_USER: "u@example.org", SMTP_PASSWORD: "p", NOTIFY_FROM_NAME: 'Alerts "x"',
        })
        try {
            expect(isNotificationSmtpConfigured()).toBe(true)
            expect(notificationFromAddress()).toBe('"Alerts x" <u@example.org>')
        } finally {
            process.env = saved
        }
    })
})
