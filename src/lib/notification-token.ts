/**
 * Signed links for publication-notification subscribers.
 *
 * Format: base64url(payload).base64url(HMAC_SHA256(payload, NOTIFY_TOKEN_SECRET))
 *
 * - `confirm`: double opt-in link, expires after 30 days. Only its sha256 is
 *   stored (`notification_subscribers.confirm_token_hash`), so it is single-use.
 * - `manage`: preference-centre link, no expiry.
 * - `unsub`: one-click unsubscribe (List-Unsubscribe), no expiry.
 *
 * Every token carries the subscriber's `token_version`; callers must reject a
 * token whose version no longer matches the row. Same construction as
 * `identity-cookie.ts`, but with its own secret: nothing is shared with the
 * public identity cookie.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { getNotifyEnv } from "./env"

export const NOTIFY_TOKEN_PURPOSES = ["confirm", "manage", "unsub"] as const
export type NotifyTokenPurpose = (typeof NOTIFY_TOKEN_PURPOSES)[number]

export const CONFIRM_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

const payloadSchema = z.object({
    p: z.enum(NOTIFY_TOKEN_PURPOSES),
    sid: z.string().regex(/^\d{1,20}$/),
    v: z.number().int().nonnegative(),
    iat: z.number().int().positive(),
    exp: z.number().int().positive().nullable(),
})

export interface SignNotifyTokenInput {
    purpose: NotifyTokenPurpose
    subscriberId: bigint
    version: number
    /** Override issued-at (seconds). Tests only. */
    now?: number
}

export interface VerifiedNotifyToken {
    subscriberId: bigint
    version: number
    iat: number
    exp: number | null
}

function base64UrlEncode(buf: Buffer | string): string {
    const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf
    return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(value: string): Buffer {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4)
    return Buffer.from(padded, "base64")
}

function sign(payloadB64: string): string {
    return base64UrlEncode(createHmac("sha256", getNotifyEnv().NOTIFY_TOKEN_SECRET).update(payloadB64).digest())
}

export function signNotifyToken(input: SignNotifyTokenInput): string {
    const iat = input.now ?? Math.floor(Date.now() / 1000)
    const payload = {
        p: input.purpose,
        sid: input.subscriberId.toString(),
        v: input.version,
        iat,
        exp: input.purpose === "confirm" ? iat + CONFIRM_TOKEN_TTL_SECONDS : null,
    }
    const payloadB64 = base64UrlEncode(JSON.stringify(payload))
    return `${payloadB64}.${sign(payloadB64)}`
}

/** Returns null for a bad signature, wrong purpose, malformed payload or expired confirm link. */
export function verifyNotifyToken(
    token: string | null | undefined,
    purpose: NotifyTokenPurpose,
    nowSeconds?: number,
): VerifiedNotifyToken | null {
    if (!token || typeof token !== "string" || token.length > 512) return null
    const parts = token.split(".")
    if (parts.length !== 2) return null

    const [payloadB64, sig] = parts
    const expected = sign(payloadB64)
    if (sig.length !== expected.length) return null
    try {
        if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    } catch {
        return null
    }

    let json: unknown
    try {
        json = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"))
    } catch {
        return null
    }
    const parsed = payloadSchema.safeParse(json)
    if (!parsed.success || parsed.data.p !== purpose) return null

    const now = nowSeconds ?? Math.floor(Date.now() / 1000)
    if (parsed.data.exp !== null && now > parsed.data.exp) return null

    return {
        subscriberId: BigInt(parsed.data.sid),
        version: parsed.data.v,
        iat: parsed.data.iat,
        exp: parsed.data.exp,
    }
}

/** sha256 hex, used to store the single-use confirm token. */
export function hashNotifyToken(token: string): string {
    return createHash("sha256").update(token).digest("hex")
}
