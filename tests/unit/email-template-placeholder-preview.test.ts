import { describe, it, expect } from "vitest"

import { buildPlaceholderPreview } from "@/src/features/email-templates/utils/placeholder-preview"

const MARK = (v: string) => `<strong style="color:#3b82f6">[${v}]</strong>`

describe("buildPlaceholderPreview (#248)", () => {
    it("marks each variable in the HTML and shows it in brackets in the subject", () => {
        expect(buildPlaceholderPreview("<p>Hi {{name}}</p>", "Issue {{volume}}", ["name", "volume"])).toEqual({
            html: `<p>Hi ${MARK("name")}</p>`,
            subject: "Issue [volume]",
        })
    })

    it("replaces every occurrence of a variable", () => {
        const r = buildPlaceholderPreview("{{a}} and {{a}}", "{{a}}{{a}}", ["a"])
        expect(r.html).toBe(`${MARK("a")} and ${MARK("a")}`)
        expect(r.subject).toBe("[a][a]")
    })

    it("leaves placeholders that are not in the variable list untouched", () => {
        expect(buildPlaceholderPreview("{{a}} {{b}}", "{{b}}", ["a"])).toEqual({ html: `${MARK("a")} {{b}}`, subject: "{{b}}" })
    })

    it("treats missing content as empty", () => {
        expect(buildPlaceholderPreview(undefined, undefined, ["a"])).toEqual({ html: "", subject: "" })
        expect(buildPlaceholderPreview("", "", [])).toEqual({ html: "", subject: "" })
    })

    // Pinned current behaviour: {{v}} also matches inside a raw {{{v}}} block, leaving stray braces.
    // Changing this is a separate decision (#248).
    it("keeps the existing behaviour for raw triple-brace blocks", () => {
        expect(buildPlaceholderPreview("{{{toc_html}}}", "", ["toc_html"]).html).toBe(`{${MARK("toc_html")}}`)
    })
})
