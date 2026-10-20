import { describe, it, expect, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// Issue #165 (part B): forgot/reset password pages. Server-rendered markup only
// (Vitest runs in Node, no DOM); interaction is covered by
// e2e/admin-password-reset.spec.ts in CI.

const state = vi.hoisted(() => ({ query: "", pathname: "/admin/login" }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.query),
  usePathname: () => state.pathname,
}))

const VALID_QUERY = "id=5&token=" + "a".repeat(43)

describe("admin forgot-password page", () => {
  async function render() {
    const { default: Page } = await import("@/app/admin/forgot-password/page")
    return renderToStaticMarkup(createElement(Page))
  }

  it("has an email input with autocomplete and a submit button", async () => {
    const html = await render()
    const email = html.match(/<input[^>]*id="email"[^>]*>/)![0]
    expect(email).toMatch(/autocomplete="email"/i)
    expect(email).toContain('placeholder="you@example.com"')
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>(?:(?!<\/button>).)*Send reset link/)
    expect(html).toContain("Reset your password")
    expect(html).toContain('href="/admin/login"')
  })

  it("uses the shared shell: one h1 and no legacy logo", async () => {
    const html = await render()
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).not.toContain("logodigitopub.png")
  })
})

describe("admin reset-password page", () => {
  async function render() {
    const { ResetPasswordForm } = await import("@/src/features/auth/components/reset-password-form")
    return renderToStaticMarkup(createElement(ResetPasswordForm))
  }

  it("renders two new-password fields with visibility toggles when params are present", async () => {
    state.query = VALID_QUERY
    const html = await render()
    const pw = html.match(/<input[^>]*id="password"[^>]*>/)![0]
    const confirm = html.match(/<input[^>]*id="confirmPassword"[^>]*>/)![0]
    expect(pw).toMatch(/autocomplete="new-password"/i)
    expect(confirm).toMatch(/autocomplete="new-password"/i)
    expect(html.match(/aria-label="Toggle password visibility"/g)).toHaveLength(2)
  })

  it("shows a live rule checklist and the expiry note", async () => {
    state.query = VALID_QUERY
    const html = await render()
    expect(html).toContain("At least 6 characters")
    expect(html).toContain("Passwords match")
    expect(html).toContain("This link expires 15 minutes after it was sent.")
    expect(html).toMatch(/<ul[^>]*aria-live="polite"/)
  })

  it("shows the invalid-link state when id/token are missing", async () => {
    state.query = ""
    const html = await render()
    expect(html).toMatch(/<h1[^>]*>Link expired or invalid<\/h1>/)
    expect(html).toContain("This reset link is invalid or has expired.")
    expect(html).toContain('href="/admin/forgot-password"')
    expect(html).not.toMatch(/<input/)
  })

  it("default export wraps the form in Suspense and renders", async () => {
    state.query = ""
    const { default: Page } = await import("@/app/admin/reset-password/page")
    expect(() => renderToStaticMarkup(createElement(Page))).not.toThrow()
  })
})

describe("admin login page", () => {
  it("links to forgot-password", async () => {
    const { default: AdminLoginPage } = await import("@/app/admin/login/page")
    const html = renderToStaticMarkup(createElement(AdminLoginPage))
    expect(html).toContain('href="/admin/forgot-password"')
    expect(html).toContain("Forgot password?")
  })
})

// The admin layout wraps non-auth pages in the dashboard shell, whose session
// check bounces logged-out visitors to /admin/login.
vi.mock("@/components/admin-sidebar", () => ({ AdminSidebar: () => createElement("nav", null, "DASHBOARD-SHELL") }))
vi.mock("@/components/admin-header", () => ({ AdminHeader: () => null }))

describe("admin layout", () => {
  it.each(["/admin/forgot-password", "/admin/reset-password"])("renders %s without the dashboard shell", async (path) => {
    state.pathname = path
    const { default: Layout } = await import("@/app/admin/layout")
    const html = renderToStaticMarkup(createElement(Layout, null, createElement("p", null, "PAGE")))
    expect(html).toContain("PAGE")
    expect(html).not.toContain("DASHBOARD-SHELL")
  })
})
