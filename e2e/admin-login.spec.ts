import { test, expect } from "@playwright/test"

// Issue #165 (PR A): admin login show/hide toggle + UI/UX polish.
// Logged-out journey: clear any admin session the project may inject.
test.use({ storageState: { cookies: [], origins: [] } })

const INVALID = { status: 401, contentType: "application/json", body: JSON.stringify({ error: "Invalid email or password" }) }

test.describe("admin login", () => {
  test("password visibility toggle switches type and state", async ({ page }) => {
    await page.goto("/admin/login")
    const password = page.locator("#password")
    const toggle = page.getByRole("switch", { name: "Toggle password visibility" })
    await password.fill("s3cret-value")
    await expect(password).toHaveAttribute("type", "password")
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await toggle.click()
    await expect(password).toHaveAttribute("type", "text")
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await expect(password).toHaveValue("s3cret-value") // toggling never clears input
    await toggle.click()
    await expect(password).toHaveAttribute("type", "password")
  })

  test("shows the error, clears it on typing, and sends one request per submit", async ({ page }) => {
    let calls = 0
    await page.route("**/api/auth/login", async (route) => {
      calls++
      await new Promise((r) => setTimeout(r, 400)) // keep the request in flight
      await route.fulfill(INVALID)
    })
    await page.goto("/admin/login")
    await page.locator("#email").fill("admin@example.com")
    await page.locator("#password").fill("wrong-password")
    const submit = page.getByRole("button", { name: /sign in/i })
    await submit.dblclick()
    await expect(page.getByRole("alert")).toContainText("Invalid email or password")
    expect(calls).toBe(1)
    await page.locator("#password").press("x")
    await expect(page.getByRole("alert")).toHaveCount(0)
  })

  test("Enter in the password field submits the form", async ({ page }) => {
    let calls = 0
    await page.route("**/api/auth/login", async (route) => { calls++; await route.fulfill(INVALID) })
    await page.goto("/admin/login")
    await page.locator("#email").fill("admin@example.com")
    await page.locator("#password").fill("wrong-password")
    await page.locator("#password").press("Enter")
    await expect(page.getByRole("alert")).toBeVisible()
    expect(calls).toBe(1)
  })

  test("fits a phone without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/admin/login")
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(overflow).toBe(false)
    await expect(page.getByRole("button", { name: /sign in/i })).toBeInViewport()
  })
})
