/**
 * UIET-P1 named rate-limit configurations.
 *
 * Composed on top of the existing in-memory sliding-window limiter
 * in src/lib/rate-limiter.ts. Two windows can be combined to enforce both
 * per-minute and per-hour caps.
 */

import { checkRateLimit, type RateLimitResult } from "./rate-limiter"
import { clientIpFromHeaders } from "./ip-hash"

export const METRICS_PER_MIN = { maxRequests: 60, windowMs: 60 * 1000, keyPrefix: "metrics:1m" }
export const METRICS_PER_HOUR = { maxRequests: 600, windowMs: 60 * 60 * 1000, keyPrefix: "metrics:1h" }
export const ORCID_CALLBACK_PER_MIN = {
  maxRequests: 10,
  windowMs: 60 * 1000,
  keyPrefix: "orcid:cb:1m",
}

// ─── Admin auth / OTP hygiene (hotfix A4) ────────────────────────────
/** Admin login: 10 attempts per IP per 15 minutes */
export const ADMIN_LOGIN_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
  keyPrefix: "admlogin",
} as const
/** OTP resend: 3 per IP+email per 10 minutes (key = `${ip}:${email}`) */
export const OTP_RESEND_RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 10 * 60 * 1000,
  keyPrefix: "otpresend",
} as const
/** OTP verification: 15 attempts per IP per 15 minutes */
export const OTP_VERIFY_RATE_LIMIT = {
  maxRequests: 15,
  windowMs: 15 * 60 * 1000,
  keyPrefix: "otpverify",
} as const

// ─── Admin password recovery (#165) ──────────────────────────────────
/** Reset-link requests: 3 per email per hour, whatever the IP (key = email) */
export const PASSWORD_RESET_EMAIL_RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 60 * 60 * 1000,
  keyPrefix: "pwreset:email",
} as const
/** Reset-link requests: 10 per IP per hour, across emails */
export const PASSWORD_RESET_IP_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
  keyPrefix: "pwreset:ip",
} as const
/** Reset-link consumption: 15 attempts per IP per 15 minutes */
export const PASSWORD_RESET_CONSUME_RATE_LIMIT = {
  maxRequests: 15,
  windowMs: 15 * 60 * 1000,
  keyPrefix: "pwreset:consume",
} as const

// ─── Journal hosting request (hotfix A5) ─────────────────────────────
/** Journal hosting request form: 3 per IP per 15 minutes */
export const JOURNAL_HOSTING_RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 15 * 60 * 1000,
  keyPrefix: "jhost",
} as const

// ─── Publication notifications (#199) ────────────────────────────────
/** Public alert sign-ups: 5 per IP per hour */
export const NOTIFY_SUBSCRIBE_IP_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 60 * 60 * 1000,
  keyPrefix: "notify:sub:ip",
} as const
/** Confirmation emails: 3 per address per hour (over the limit, nothing is sent; the response stays generic) */
export const NOTIFY_SUBSCRIBE_EMAIL_RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 60 * 60 * 1000,
  keyPrefix: "notify:sub:email",
} as const
/** Token endpoints (confirm, preferences, unsubscribe): 30 per IP per 15 minutes */
export const NOTIFY_TOKEN_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 15 * 60 * 1000,
  keyPrefix: "notify:token",
} as const

export interface MultiLimitResult extends RateLimitResult {
  /** Which window tripped first; null when allowed. */
  triggered: string | null
}

export function enforceMetricsRateLimit(headers: Headers): MultiLimitResult {
  const ip = clientIpFromHeaders(headers)
  const perMin = checkRateLimit(ip, METRICS_PER_MIN)
  if (!perMin.allowed) return { ...perMin, triggered: "minute" }
  const perHour = checkRateLimit(ip, METRICS_PER_HOUR)
  if (!perHour.allowed) return { ...perHour, triggered: "hour" }
  return { ...perMin, triggered: null }
}

export function enforceOrcidCallbackRateLimit(headers: Headers): MultiLimitResult {
  const ip = clientIpFromHeaders(headers)
  const res = checkRateLimit(ip, ORCID_CALLBACK_PER_MIN)
  return { ...res, triggered: res.allowed ? null : "minute" }
}
