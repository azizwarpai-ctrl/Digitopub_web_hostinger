import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Shared layout for the admin sign-in and password recovery pages.

async function render(props: Record<string, unknown> = {}) {
  const { AuthShell } = await import("@/src/features/auth/components/auth-shell")
  return renderToStaticMarkup(
    createElement(AuthShell, { title: "Sign in", description: "DigitoPub admin portal", ...props }, createElement("form", null, "FORM")),
  )
}

describe("AuthShell", () => {
  it("renders exactly one h1 with the title, the description and the content", async () => {
    const html = await render()
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toMatch(/<h1[^>]*>Sign in<\/h1>/)
    expect(html).toContain("DigitoPub admin portal")
    expect(html).toContain("<form>FORM</form>")
  })

  it("uses the optimised logos with alt text and real dimensions, never the 1 MB original", async () => {
    const html = await render()
    expect(html).not.toContain("logodigitopub.png")
    // Decoded: outside the app config next/image routes src through /_next/image?url=…
    const imgs = (html.match(/<img[^>]*>/g) ?? []).map((i) => decodeURIComponent(i.replace(/&amp;/g, "&")))
    expect(imgs.some((i) => i.includes("/images/logo-digitopub-320.webp"))).toBe(true)
    expect(imgs.some((i) => i.includes("/images/logo-digitopub-white-320.webp"))).toBe(true)
    for (const img of imgs) {
      expect(img).toMatch(/width="\d+"/)
      expect(img).toMatch(/height="\d+"/)
      expect(img).toMatch(/alt="(DigitoPub)?"/)
    }
    // One logo is announced; duplicates for theme swapping are decorative.
    expect(imgs.filter((i) => i.includes('alt="DigitoPub"'))).toHaveLength(1)
  })

  it("shows the brand panel only from lg up and keeps a compact logo for small screens", async () => {
    const html = await render()
    expect(html).toMatch(/<aside[^>]*class="[^"]*\bhidden\b[^"]*\blg:flex\b/)
    expect(html).toMatch(/class="[^"]*\blg:hidden\b/)
    expect(html).toContain("min-h-[100dvh]")
  })

  it("renders an optional footer", async () => {
    const html = await render({ footer: createElement("a", { href: "/" }, "Back to main site") })
    expect(html).toContain('<a href="/">Back to main site</a>')
  })
})
