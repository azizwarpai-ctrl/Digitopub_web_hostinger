import { test, expect, type Page } from "@playwright/test"

// Issue #165 (part B): admin password recovery pages. Logged-out journey.
test.use({ storageState: { cookies: [], origins: [] } })

// Next.js injects its own role="alert" route announcer on every page, so scope
// alert lookups to the form.
const formAlert = (page: Page) => page.locator("form").getByRole("alert")

const GENERIC = "If an account exists for this email, a reset link has been sent."
const INVALID_LINK = "This reset link is invalid or has expired."
const RESET_URL = "/admin/reset-password?id=5&token=" + "a".repeat(43)

const json = (status: number, body: unknown) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
})

test.describe("admin password recovery", () => {
  test("login links to the forgot-password page", async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByRole("link", { name: "Forgot password?" }).click()
    await expect(page).toHaveURL(/\/admin\/forgot-password$/)
  })

  test("forgot-password shows the generic message and removes the form", async ({ page }) => {
    await page.route("**/api/auth/forgot-password", (route) =>
      route.fulfill(json(200, { success: true, message: GENERIC })),
    )
    await page.goto("/admin/forgot-password")
    await page.locator("#email").fill("admin@example.com")
    await page.getByRole("button", { name: "Send reset link" }).click()
    const status = page.getByRole("main").getByRole("status")
    await expect(status.locator("strong")).toHaveText("admin@example.com")
    await expect(status).toContainText("expires in 15 minutes")
    await expect(page.locator("form")).toHaveCount(0)
    await expect(page.getByRole("link", { name: "Back to log in" })).toHaveCount(1)
  })

  test("forgot-password resend is disabled during a countdown, then works", async ({ page }) => {
    await page.clock.install()
    let calls = 0
    await page.route("**/api/auth/forgot-password", (route) => {
      calls++
      return route.fulfill(json(200, { success: true, message: GENERIC }))
    })
    await page.goto("/admin/forgot-password")
    await page.locator("#email").fill("admin@example.com")
    await page.getByRole("button", { name: "Send reset link" }).click()
    const resend = page.getByRole("button", { name: /^Send another link/ })
    await expect(resend).toBeDisabled()
    await expect(resend).toContainText(/Send another link in \d+s/)
    await page.clock.fastForward(61_000)
    await expect(resend).toBeEnabled()
    await expect(resend).toHaveText("Send another link")
    await resend.click()
    await expect.poll(() => calls).toBe(2)
  })

  test("reset-password without params shows the invalid-link state", async ({ page }) => {
    await page.goto("/admin/reset-password")
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(INVALID_LINK)
    await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/admin/forgot-password",
    )
  })

  test("rule checklist updates as the user types", async ({ page }) => {
    await page.goto(RESET_URL)
    const length = page.getByRole("listitem").filter({ hasText: "At least 6 characters" })
    const match = page.getByRole("listitem").filter({ hasText: "Passwords match" })
    await page.locator("#password").fill("abc")
    await expect(length).toContainText("(not met)")
    await page.locator("#password").fill("new-password-1")
    await page.locator("#confirmPassword").fill("new-password-1")
    await expect(length).toContainText("(met)")
    await expect(length).not.toContainText("(not met)")
    await expect(match).toContainText("(met)")
    await expect(match).not.toContainText("(not met)")
  })

  test("mismatched passwords show an error and send no request", async ({ page }) => {
    let calls = 0
    await page.route("**/api/auth/reset-password", (route) => {
      calls++
      return route.fulfill(json(200, { success: true, message: "ok" }))
    })
    await page.goto(RESET_URL)
    await page.locator("#password").fill("new-password-1")
    await page.locator("#confirmPassword").fill("new-password-2")
    await page.getByRole("button", { name: "Reset password" }).click()
    await expect(formAlert(page)).toContainText("Passwords do not match")
    expect(calls).toBe(0)
  })

  test("successful reset offers a log in link", async ({ page }) => {
    let sent: { id?: string; token?: string } = {}
    await page.route("**/api/auth/reset-password", (route) => {
      sent = route.request().postDataJSON()
      return route.fulfill(json(200, { success: true, message: "Your password has been updated." }))
    })
    await page.goto(RESET_URL)
    // The secret is removed from the address bar but still used for the request.
    await expect(page).toHaveURL(/\/admin\/reset-password$/)
    await page.locator("#password").fill("new-password-1")
    await page.locator("#confirmPassword").fill("new-password-1")
    await page.getByRole("button", { name: "Reset password" }).click()
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible()
    expect(sent).toMatchObject({ id: "5", token: "a".repeat(43) })
  })

  test("an invalid-link response switches to the invalid-link state", async ({ page }) => {
    await page.route("**/api/auth/reset-password", (route) =>
      route.fulfill(json(400, { success: false, error: INVALID_LINK })),
    )
    await page.goto(RESET_URL)
    await page.locator("#password").fill("new-password-1")
    await page.locator("#confirmPassword").fill("new-password-1")
    await page.getByRole("button", { name: "Reset password" }).click()
    await expect(page.getByText(INVALID_LINK)).toBeVisible()
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible()
  })
})
