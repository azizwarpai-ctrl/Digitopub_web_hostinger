import { Hono } from "hono"

import { verifyCronSecret } from "@/src/lib/cron-auth"
import { clientIpFromHeaders } from "@/src/lib/ip-hash"

/**
 * Operations diagnostics, CRON_SECRET-protected like the cron endpoints.
 *
 * GET /ops/client-ip echoes the forwarding headers of the caller's OWN
 * request, so the hop that holds the real client address behind the
 * hosting proxy and CDN can be read off once (#194): call it with a
 * deliberately spoofed X-Forwarded-For and see where the real address lands.
 * It never returns anything about other visitors.
 */
const FORWARDING_HEADERS = [
    "x-real-ip",
    "cf-connecting-ip",
    "true-client-ip",
    "x-client-ip",
    "x-forwarded-proto",
    "x-forwarded-host",
    "forwarded",
    "via",
] as const

const app = new Hono()

app.get("/client-ip", (c) => {
    if (!verifyCronSecret(c.req.header("authorization"))) {
        return c.json({ success: false, error: "Unauthorized" }, 401)
    }
    const headers = c.req.raw.headers
    const forwardedFor = (headers.get("x-forwarded-for") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    const others = Object.fromEntries(FORWARDING_HEADERS.map((h) => [h, headers.get(h)]))
    return c.json({
        success: true,
        data: {
            x_forwarded_for: forwardedFor,
            ...others,
            used_for_rate_limits: clientIpFromHeaders(headers),
        },
    })
})

export { app as opsRouter }
