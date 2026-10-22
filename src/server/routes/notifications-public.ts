/**
 * Public publication-alert endpoints (#199), mounted at /notifications BEFORE
 * the admin notifications router so its `requireAdmin` never runs here.
 *
 * Authentication is by signed link only (src/lib/notification-token.ts).
 * These routes never touch admin auth (getSession / jwtVerify): the ESLint
 * identity-import ban covers this directory.
 */

import { Hono, type Context } from "hono"
import { zValidator } from "@hono/zod-validator"

import { checkRateLimit, type RateLimitResult } from "@/src/lib/rate-limiter"
import {
    NOTIFY_SUBSCRIBE_EMAIL_RATE_LIMIT,
    NOTIFY_SUBSCRIBE_IP_RATE_LIMIT,
    NOTIFY_TOKEN_RATE_LIMIT,
} from "@/src/lib/rate-limiter-configs"
import { clientIpFromHeaders, hashIp } from "@/src/lib/ip-hash"
import { serializeRecord } from "@/src/lib/serialize"
import {
    preferencesSchema,
    publicSubscribeSchema,
    tokenBodySchema,
} from "@/src/features/notifications/schemas/notification-schemas"
import {
    confirmSubscription,
    deliverEmail,
    getPreferences,
    getPublicOptions,
    requestSubscription,
    unsubscribe,
    updatePreferences,
    type EmailJob,
} from "@/src/features/notifications/server/public-service"

export const SUBSCRIBE_GENERIC_MESSAGE =
    "Thank you. If this address can receive alerts, a confirmation email is on its way. Please check your inbox."

const pendingEmails = new Set<Promise<void>>()

/** Sends after the response, so known and unknown addresses take the same time. */
export function sendLater(job: EmailJob | null) {
    if (!job) return
    const p = deliverEmail(job)
    pendingEmails.add(p)
    void p.finally(() => pendingEmails.delete(p))
}

/** Test helper: resolves once every queued lifecycle email has been attempted. */
export async function __flushNotificationEmailsForTests() {
    await Promise.all([...pendingEmails])
}

/** Consent evidence only: a misconfigured salt must not block the sign-up itself. */
export function consentIpHash(ip: string): string | null {
    try {
        return hashIp(ip) || null
    } catch (e) {
        console.error("[Notifications] consent IP hash unavailable:", e instanceof Error ? e.message : e)
        return null
    }
}

function tooMany(c: Context, rate: RateLimitResult) {
    c.res.headers.set("Retry-After", String(rate.retryAfter))
    return c.json({ success: false, error: "Too many requests. Please try again later." }, 429)
}

function tokenRate(c: Context) {
    return checkRateLimit(clientIpFromHeaders(c.req.raw.headers), NOTIFY_TOKEN_RATE_LIMIT)
}

/** RFC 8058 sends `List-Unsubscribe=One-Click` as a form post to the header URL; humans' pages send JSON. */
async function readUnsubscribeToken(c: Context): Promise<string | null> {
    const fromQuery = c.req.query("token")
    if (fromQuery) return fromQuery
    const type = c.req.header("content-type") || ""
    try {
        if (type.includes("application/json")) {
            const body = (await c.req.json()) as { token?: unknown }
            return typeof body?.token === "string" ? body.token : null
        }
        if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
            const form = await c.req.parseBody()
            return typeof form.token === "string" ? form.token : null
        }
    } catch {
        return null
    }
    return null
}

const app = new Hono()
    .get("/options", async (c) => {
        const options = await getPublicOptions()
        return c.json({ success: true, data: serializeRecord(options) })
    })

    .post("/subscribe", zValidator("json", publicSubscribeSchema), async (c) => {
        const body = c.req.valid("json")
        const generic = c.json({ success: true, message: SUBSCRIBE_GENERIC_MESSAGE }, 202)

        // Bots fill every field; answer as if it worked.
        if (body.website) return generic

        const ip = clientIpFromHeaders(c.req.raw.headers)
        const byIp = checkRateLimit(ip, NOTIFY_SUBSCRIBE_IP_RATE_LIMIT)
        if (!byIp.allowed) return tooMany(c, byIp)
        // Per-address limit is silent: the caller must not learn anything about the address.
        if (!checkRateLimit(body.email.trim().toLowerCase(), NOTIFY_SUBSCRIBE_EMAIL_RATE_LIMIT).allowed) return generic

        try {
            const job = await requestSubscription({
                email: body.email,
                name: body.name,
                journal_ids: body.journal_ids,
                discipline_ids: body.discipline_ids,
                source: "public_form",
                ipHash: consentIpHash(ip),
            })
            sendLater(job)
        } catch (e) {
            console.error("[Notifications] subscribe failed:", e instanceof Error ? e.message : e)
        }
        return generic
    })

    .post("/confirm", zValidator("json", tokenBodySchema), async (c) => {
        const rate = tokenRate(c)
        if (!rate.allowed) return tooMany(c, rate)

        const outcome = await confirmSubscription(c.req.valid("json").token)
        if (outcome.status === "invalid") return c.json({ success: false, error: "INVALID_LINK" }, 400)
        if (outcome.status === "expired") return c.json({ success: false, error: "EXPIRED_LINK" }, 410)
        if (outcome.status === "confirmed") sendLater(outcome.welcome)
        return c.json({ success: true, data: { status: outcome.status, manage_url: outcome.manageUrl } })
    })

    .post("/preferences/lookup", zValidator("json", tokenBodySchema), async (c) => {
        const rate = tokenRate(c)
        if (!rate.allowed) return tooMany(c, rate)

        const prefs = await getPreferences(c.req.valid("json").token)
        if (!prefs) return c.json({ success: false, error: "INVALID_LINK" }, 400)
        return c.json({ success: true, data: serializeRecord(prefs) })
    })

    .post("/preferences", zValidator("json", preferencesSchema), async (c) => {
        const rate = tokenRate(c)
        if (!rate.allowed) return tooMany(c, rate)

        const { token, ...input } = c.req.valid("json")
        const outcome = await updatePreferences(token, input)
        if (outcome.status === "invalid") return c.json({ success: false, error: "INVALID_LINK" }, 400)
        if (outcome.status === "suppressed") {
            return c.json({ success: false, error: "This address can no longer receive alerts." }, 409)
        }
        sendLater(outcome.email)
        return c.json({ success: true, message: "Preferences saved." })
    })

    .get("/unsubscribe", (c) => {
        // A human opened the List-Unsubscribe URL: show the confirmation page.
        const token = c.req.query("token") || ""
        return c.redirect(`/notifications/unsubscribe?token=${encodeURIComponent(token)}`, 303)
    })

    .post("/unsubscribe", async (c) => {
        const rate = tokenRate(c)
        if (!rate.allowed) return tooMany(c, rate)

        const token = await readUnsubscribeToken(c)
        if (!token || (await unsubscribe(token)) === "invalid") {
            return c.json({ success: false, error: "INVALID_LINK" }, 400)
        }
        return c.json({ success: true, message: "You have been unsubscribed." })
    })

export { app as notificationsPublicRouter }
