/**
 * Daily-rotating salted SHA-256 hash of IP / User-Agent.
 *
 *   salt = HMAC_SHA256(EVENT_IP_HASH_SALT_SEED, "YYYY-MM-DD" UTC)
 *   hash = SHA-256(salt || input)
 *
 * Same input on different UTC days yields different hashes — the salt rotates
 * at midnight UTC, so cross-day correlation is impossible without the seed.
 */

import { createHash, createHmac } from "node:crypto"
import { getMetricsEnv } from "./env"

/** Return today's UTC date string in `YYYY-MM-DD` format. */
export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Internal helper: salt for a given day. */
function dailySalt(day: string): Buffer {
  const env = getMetricsEnv()
  return createHmac("sha256", env.EVENT_IP_HASH_SALT_SEED).update(day).digest()
}

/** Hash a single value (IP or UA) with the day-rotating salt. Lowercase hex. */
export function hashWithDailySalt(value: string, day: string = dayKey()): string {
  if (!value) return ""
  const salt = dailySalt(day)
  return createHash("sha256").update(salt).update(value).digest("hex")
}

/** Convenience wrapper for an IP. */
export function hashIp(ip: string, day: string = dayKey()): string {
  return hashWithDailySalt(ip, day)
}

/** Convenience wrapper for a User-Agent. */
export function hashUa(ua: string, day: string = dayKey()): string {
  return hashWithDailySalt(ua, day)
}

/** Proxies in front of the app that append to X-Forwarded-For (`TRUSTED_PROXY_HOPS`, default 1). */
function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS
  const n = raw && /^\d+$/.test(raw) ? Number(raw) : 1
  return n >= 1 ? n : 1
}

/**
 * The client IP for rate limits and hashing (#194).
 *
 * X-Forwarded-For is client-controlled on the left: anyone can send a fresh
 * value with every request. The trusted proxy appends the real client on the
 * right, so the address `TRUSTED_PROXY_HOPS` entries from the right is the
 * one to use. Verified in production (Hostinger proxy + CDN): the right-most
 * entry and X-Real-IP, which the proxy overwrites, both hold the real client.
 * Headers the proxy does not set (cf-connecting-ip, x-client-ip) are never
 * trusted, since a client could forge them.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const hops = trustedProxyHops()
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (chain.length >= hops) return chain[chain.length - hops]
  // A chain shorter than the trusted hops was not built by the proxy: fail
  // closed rather than fall back to a client-chosen entry.
  return headers.get("x-real-ip")?.trim() || "0.0.0.0"
}
