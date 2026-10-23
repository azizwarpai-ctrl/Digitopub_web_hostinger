import { describe, it, expect } from "vitest"
import DOMPurify from "dompurify"
import { sanitizeCitationHtml } from "@/src/features/journals/utils/sanitize-html"

// Runs with the real DOMPurify in Node, where there is no window: the same
// situation as the server render of the article page.
describe("sanitizeCitationHtml without a browser", () => {
    it("DOMPurify has no sanitize() here, which crashed the article page", () => {
        expect(typeof (DOMPurify as unknown as { sanitize?: unknown }).sanitize).not.toBe("function")
    })

    it("does not throw and keeps only bare <i> emphasis", () => {
        const html = 'Smith J. Title. <i>Journal</i>. 2026;<b>3</b>(1):1-5. <img src=x onerror="alert(1)"><i onclick="x()">t</i>'
        expect(sanitizeCitationHtml(html)).toBe("Smith J. Title. <i>Journal</i>. 2026;3(1):1-5. t</i>")
    })

    it("leaves escaped text alone", () => {
        expect(sanitizeCitationHtml("A &amp; B &lt;C&gt;")).toBe("A &amp; B &lt;C&gt;")
    })
})
