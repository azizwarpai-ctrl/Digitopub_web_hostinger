import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { salutationName, longDate, journalInvitationVars } from "@/src/features/notifications/server/invitation-vars"
import { TEMPLATE_SET, buildTemplateSet } from "@/src/features/notifications/server/template-set"
import { sampleVariables } from "@/src/features/notifications/server/sample-data"
import { RAW_BLOCK_VARIABLES } from "@/src/features/notifications/server/render-blocks"
import { contentProblems } from "@/src/features/notifications/server/content-guard"
import { EMAIL_STYLE_KEYS, EMAIL_STYLES } from "@/src/features/notifications/server/email-styles"
import { renderHtmlTemplate, renderTemplate } from "@/src/lib/email/renderer"
import { journalUpdateSchema } from "@/src/features/journals/schemas/journal-schema"

describe("salutationName (#231)", () => {
    it("adds Dr. to a bare name", () => expect(salutationName("Jane Doe")).toBe("Dr. Jane Doe"))
    it.each(["Dr Jane Doe", "Dr. Jane Doe", "dr. jane doe"])("does not double the title on %s", (n) => {
        const r = salutationName(n)
        expect(r).toMatch(/^Dr\. /i)
        expect(r.toLowerCase()).not.toContain("dr. dr")
        expect(r.toLowerCase()).toBe("dr. jane doe")
    })
    it("replaces Prof. and repeated titles", () => {
        expect(salutationName("Prof. Ahmed Saleh")).toBe("Dr. Ahmed Saleh")
        expect(salutationName("Dr. Prof. X")).toBe("Dr. X")
    })
    it("falls back to Colleague", () => {
        for (const v of ["", null, "  "]) expect(salutationName(v)).toBe("Colleague")
    })
    it("does not strip names that merely start with Dr", () => expect(salutationName("Drew Smith")).toBe("Dr. Drew Smith"))
})

describe("longDate", () => {
    it("formats en-GB in UTC", () => expect(longDate(new Date("2026-11-23T23:30:00Z"))).toBe("23 November 2026"))
})

describe("journalInvitationVars", () => {
    it("builds short name, scope sentence and url", () => {
        const v = journalInvitationVars({ title: "International Journal of Maxillofacial Prosthetics", ojs_path: "ijmp", invitation_scope: "an international, peer-reviewed journal." })
        expect(v.journal_short).toBe("IJMP")
        expect(v.journal_scope_sentence).toBe(", an international, peer-reviewed journal")
        expect(v.journal_url.endsWith("/journals/ijmp")).toBe(true)
    })
    it("leaves the sentence empty without a scope", () => {
        expect(journalInvitationVars({ title: "T", ojs_path: "t", invitation_scope: "" }).journal_scope_sentence).toBe("")
    })
    it("uses the title when there is no path", () => {
        const v = journalInvitationVars({ title: "Some Journal", ojs_path: null, invitation_scope: null })
        expect(v.journal_short).toBe("Some Journal")
        expect(v.journal_url).not.toContain("/journals/")
    })
})

describe("notify_journal_invitation template", () => {
    const t = TEMPLATE_SET.notify_journal_invitation
    const vars = sampleVariables("notify_journal_invitation")
    const html = renderHtmlTemplate(t.html_content, vars, RAW_BLOCK_VARIABLES)
    const text = renderTemplate(t.text_content, vars)

    it("renders the sample copy", () => {
        for (const s of [
            "Dear Dr. Jane Doe",
            "Yes, keep me informed",
            "Explore the journal",
            "Stay Connected with IJMP",
            "23 November 2026",
        ]) expect(html).toContain(s)
        // The title is wrapped in <strong>, so compare the plain-text rendering for the full phrase.
        expect(html).toContain("International Journal of Maxillofacial Prosthetics (IJMP)</strong>, an international, peer-reviewed, open-access journal dedicated to")
        expect(text).toContain("International Journal of Maxillofacial Prosthetics (IJMP), an international, peer-reviewed, open-access journal dedicated to")
        expect(renderTemplate(t.subject, vars)).toBe("Stay connected with International Journal of Maxillofacial Prosthetics (IJMP)")
        expect(html).not.toMatch(/\{\{/)
        expect(text).not.toMatch(/\{\{/)
    })

    it("keeps the link placeholders for per-recipient substitution", () => {
        for (const p of ["unsubscribe_url", "manage_url", "publisher_address", "confirm_url", "journal_url"]) {
            expect(t.html_content).toContain(`{{${p}}}`)
        }
    })

    it("passes the content guard", () => {
        expect(contentProblems(t.html_content, t.text_content)).toEqual([])
    })

    it.each(EMAIL_STYLE_KEYS)("is present in the %s style set", (key) => {
        expect(buildTemplateSet(EMAIL_STYLES[key]).notify_journal_invitation).toBeTruthy()
    })
})

describe("journal schema invitation_scope", () => {
    it("normalises blank to null", () => {
        expect(journalUpdateSchema.parse({ invitation_scope: "  " })).toEqual({ invitation_scope: null })
    })
    it("rejects more than 500 characters", () => {
        expect(journalUpdateSchema.safeParse({ invitation_scope: "a".repeat(501) }).success).toBe(false)
    })
})
