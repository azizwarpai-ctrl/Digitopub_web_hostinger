import { Hono } from "hono"
import { clientIpFromHeaders } from "@/src/lib/ip-hash"
import { zValidator } from "@hono/zod-validator"
import { registerSchema } from "../../auth/schemas/auth-schema"
import { provisionOjsUser } from "./ojs-user-service"
import { dispatchEmailEvent } from "@/src/lib/email/event-dispatcher"
import { checkRateLimit } from "@/src/lib/rate-limiter"

/** Registration rate limit: 5 requests per IP per 15 minutes */
const REGISTRATION_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyPrefix: "reg",
} as const

/** Build the OJS login URL for a journal, e.g. https://journals.digitopub.com/index.php/myjournal/login */
function buildOjsLoginUrl(journalPath: string): string {
  const base = (
    process.env.PUBLIC_OJS_BASE_URL
    || process.env.OJS_BASE_URL
    || "https://journals.digitopub.com"
  ).replace(/\/+$/, "")
  return `${base}/index.php/${journalPath}/login`
}

const app = new Hono()

// POST /ojs/register
// Provision a new user into OJS, then hand them the journal's login page.
app.post("/register", zValidator("json", registerSchema), async (c) => {
  try {
    // Rate limiting keyed on the proxy-verified client IP (#194).
    const ip = clientIpFromHeaders(c.req.raw.headers)

    const rateCheck = process.env.NODE_ENV === "test" && process.env.TEST_DISABLE_RATE_LIMIT === "true"
      ? { allowed: true, retryAfter: 0, remaining: Infinity, resetAt: 0 }
      : checkRateLimit(ip, REGISTRATION_RATE_LIMIT)

    if (!rateCheck.allowed) {
      c.res.headers.set("Retry-After", String(rateCheck.retryAfter))
      return c.json({
        success: false,
        error: "Too many registration attempts. Please try again later.",
      }, 429)
    }
    const payload = c.req.valid("json")
    const { email, firstName, lastName } = payload

    // Guard BEFORE provisioning: a journal is required to assign OJS roles.
    const journalPath = c.req.query("journalPath")?.trim() || ""
    if (!journalPath) {
      return c.json({
        success: false,
        error: "Please choose a journal before registering.",
      }, 400)
    }

    // 1. Provision into OJS DB
    const provisionPayload = { ...payload, journalPath }
    const { success: ojsOk, error: ojsError } = await provisionOjsUser(provisionPayload)

    if (!ojsOk) {
      console.error(`[OJS Provisioning Failed] for ${email}:`, ojsError)
      if (ojsError?.toLowerCase().includes("email already exists") || ojsError?.toLowerCase().includes("unique constraint")) {
        return c.json({ success: false, error: "Email already exists" }, 400)
      }
      return c.json({ success: false, error: "OJS Provisioning Failed: " + ojsError }, 500)
    }

    // 2. Email event (fire-and-forget)
    void dispatchEmailEvent({
      type: "registration_confirmation",
      payload: {
        author_name: `${firstName} ${lastName}`.trim(),
        email,
        journal_title: "DigitoPub",
      }
    })

    // 3. Point the user at the journal's own login page (OJS 3.5 has no SSO
    //    entry point — the legacy sso_login.php handoff is dead).
    const ojsLoginUrl = buildOjsLoginUrl(journalPath)

    console.log(`[OJS_PROVISION] Success for ${email}.`)

    return c.json({
      success: true,
      status: "created",
      ojsLoginUrl,
      email,
      message: "Account created successfully. Sign in on the journal site to continue.",
    }, 201)
  } catch (error) {
    console.error("Registration error:", error)
    return c.json({ success: false, error: "Registration failed" }, 500)
  }
})

export { app as provisionRouter }
