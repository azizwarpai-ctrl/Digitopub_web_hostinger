import { describe, it, expect, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Issue #165 (PR A): admin login show/hide password toggle + UI/UX polish.
// Server-render the markup (Vitest runs in Node, no DOM); interaction is
// covered by e2e/admin-login.spec.ts in CI.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

describe("PasswordInput", () => {
  async function render(props: Record<string, unknown> = {}) {
    const { PasswordInput } = await import("@/src/features/auth/components/password-input")
    return renderToStaticMarkup(
      createElement(PasswordInput, { id: "password", autoComplete: "current-password", value: "", onChange: () => {}, ...props }),
    )
  }

  it("starts masked with an accessible visibility switch", async () => {
    const html = await render()
    expect(html).toMatch(/<input[^>]*type="password"/)
    expect(html).toMatch(/<button[^>]*type="button"/) // never submits the form
    expect(html).toMatch(/role="switch"/)
    expect(html).toMatch(/aria-checked="false"/)
    expect(html).toMatch(/aria-label="Toggle password visibility"/)
  })

  it("keeps the input text clear of the toggle and forwards autocomplete", async () => {
    const html = await render()
    expect(html).toMatch(/<input[^>]*autoComplete="current-password"|<input[^>]*autocomplete="current-password"/)
    expect(html).toMatch(/<input[^>]*class="[^"]*\bpr-10\b/)
  })
})

describe("admin login page", () => {
  async function render() {
    const { default: AdminLoginPage } = await import("@/app/admin/login/page")
    return renderToStaticMarkup(createElement(AdminLoginPage))
  }

  it("uses proper autocomplete hints and the agreed placeholder", async () => {
    const html = await render()
    expect(html).toMatch(/<input[^>]*id="email"[^>]*>/)
    const email = html.match(/<input[^>]*id="email"[^>]*>/)![0]
    expect(email).toMatch(/autocomplete="email"/i)
    expect(email).toContain('placeholder="you@example.com"')
    const password = html.match(/<input[^>]*id="password"[^>]*>/)![0]
    expect(password).toMatch(/autocomplete="current-password"/i)
  })

  it("renders the password field with the visibility toggle", async () => {
    expect(await render()).toMatch(/aria-label="Toggle password visibility"/)
  })

  it("centres the card on every viewport with a dynamic-viewport height", async () => {
    expect(await render()).toMatch(/min-h-\[100dvh\]/)
  })
})
