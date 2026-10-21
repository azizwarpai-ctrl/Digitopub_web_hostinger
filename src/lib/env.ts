/**
 * Centralized runtime env loader for UIET-P1.
 *
 * Env vars are split into focused schemas so that a missing ORCID credential
 * does not break the metrics/identity paths (and vice-versa).
 *
 * - Production: missing required vars throw at first read.
 * - Development / test: missing required vars fall back to dev defaults
 *   and emit a console warning.
 *
 * NEVER prefix any of these with NEXT_PUBLIC_ — they all live server-side.
 */

import { z } from "zod"

const isProduction = process.env.NODE_ENV === "production"
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"

const booleanFromString = z
  .union([z.string(), z.boolean(), z.undefined()])
  .transform((v) => {
    if (typeof v === "boolean") return v
    if (typeof v === "string") return v.toLowerCase() === "true"
    return false
  })

const requiredSecret = (name: string) =>
  z
    .string()
    .min(1)
    .optional()
    .transform((v) => {
      if (v && v.length > 0) return v
      if (isProduction && !isBuildPhase) {
        throw new Error(`[env] ${name} is required in production`)
      }
      if (!isBuildPhase) {
        console.warn(
          `[env] ${name} not set — using insecure dev default. DO NOT ship like this.`
        )
      }
      return `dev-default-${name}-change-me-${name.length}`
    })

const optionalString = z.string().optional().transform((v) => v || null)

// ---------------------------------------------------------------------------
// Focused schemas — each domain validates only its own vars.
// ---------------------------------------------------------------------------

const metricsEnvSchema = z.object({
  EVENT_IP_HASH_SALT_SEED: requiredSecret("EVENT_IP_HASH_SALT_SEED"),
})

const identityEnvSchema = z.object({
  IDENTITY_COOKIE_SECRET: requiredSecret("IDENTITY_COOKIE_SECRET"),
})

const orcidEnvSchema = z.object({
  ORCID_CLIENT_ID: requiredSecret("ORCID_CLIENT_ID"),
  ORCID_CLIENT_SECRET: requiredSecret("ORCID_CLIENT_SECRET"),
  ORCID_STATE_SECRET: requiredSecret("ORCID_STATE_SECRET"),
  ORCID_REDIRECT_URI: optionalString,
})

const notifyEnvSchema = z.object({
  NOTIFY_TOKEN_SECRET: requiredSecret("NOTIFY_TOKEN_SECRET"),
})

const flagsEnvSchema = z.object({
  ENABLE_ORCID_OJS_BACKFILL: booleanFromString.default(!isProduction),
  UIET_P1_ENABLED: booleanFromString.default(false),
})

// ---------------------------------------------------------------------------
// Combined schema — kept for callers that need the full set (e.g. getEnv()).
// ---------------------------------------------------------------------------

const envSchema = z.object({
  ORCID_CLIENT_ID: requiredSecret("ORCID_CLIENT_ID"),
  ORCID_CLIENT_SECRET: requiredSecret("ORCID_CLIENT_SECRET"),
  ORCID_REDIRECT_URI: optionalString,
  IDENTITY_COOKIE_SECRET: requiredSecret("IDENTITY_COOKIE_SECRET"),
  ORCID_STATE_SECRET: requiredSecret("ORCID_STATE_SECRET"),
  EVENT_IP_HASH_SALT_SEED: requiredSecret("EVENT_IP_HASH_SALT_SEED"),
  ENABLE_ORCID_OJS_BACKFILL: booleanFromString.default(!isProduction),
  UIET_P1_ENABLED: booleanFromString.default(false),
})

export type UietEnv = z.infer<typeof envSchema>
export type MetricsEnv = z.infer<typeof metricsEnvSchema>
export type IdentityEnv = z.infer<typeof identityEnvSchema>
export type OrcidEnv = z.infer<typeof orcidEnvSchema>
export type FlagsEnv = z.infer<typeof flagsEnvSchema>
export type NotifyEnv = z.infer<typeof notifyEnvSchema>

// ---------------------------------------------------------------------------
// Cached, focused readers.
// ---------------------------------------------------------------------------

let cachedMetrics: MetricsEnv | null = null
let cachedIdentity: IdentityEnv | null = null
let cachedOrcid: OrcidEnv | null = null
let cachedFlags: FlagsEnv | null = null
let cachedNotify: NotifyEnv | null = null
let cached: UietEnv | null = null

function parseOrThrow<T>(schema: z.ZodType<T>, data: Record<string, unknown>, label: string): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new Error(
      `[env] ${label} environment validation failed: ${JSON.stringify(
        parsed.error.flatten()
      )}`
    )
  }
  return parsed.data
}

export function getMetricsEnv(): MetricsEnv {
  if (cachedMetrics) return cachedMetrics
  cachedMetrics = parseOrThrow(metricsEnvSchema, {
    EVENT_IP_HASH_SALT_SEED: process.env.EVENT_IP_HASH_SALT_SEED,
  }, "metrics")
  return cachedMetrics
}

export function getIdentityEnv(): IdentityEnv {
  if (cachedIdentity) return cachedIdentity
  cachedIdentity = parseOrThrow(identityEnvSchema, {
    IDENTITY_COOKIE_SECRET: process.env.IDENTITY_COOKIE_SECRET,
  }, "identity")
  return cachedIdentity
}

/** Signing secret for notification confirm/manage/unsubscribe links (separate from the identity cookie). */
export function getNotifyEnv(): NotifyEnv {
  if (cachedNotify) return cachedNotify
  cachedNotify = parseOrThrow(notifyEnvSchema, {
    NOTIFY_TOKEN_SECRET: process.env.NOTIFY_TOKEN_SECRET,
  }, "notify")
  return cachedNotify
}

export function getOrcidEnv(): OrcidEnv {
  if (cachedOrcid) return cachedOrcid
  cachedOrcid = parseOrThrow(orcidEnvSchema, {
    ORCID_CLIENT_ID: process.env.ORCID_CLIENT_ID,
    ORCID_CLIENT_SECRET: process.env.ORCID_CLIENT_SECRET,
    ORCID_STATE_SECRET: process.env.ORCID_STATE_SECRET,
    ORCID_REDIRECT_URI: process.env.ORCID_REDIRECT_URI,
  }, "orcid")
  return cachedOrcid
}

export function getFlagsEnv(): FlagsEnv {
  if (cachedFlags) return cachedFlags
  cachedFlags = parseOrThrow(flagsEnvSchema, {
    ENABLE_ORCID_OJS_BACKFILL: process.env.ENABLE_ORCID_OJS_BACKFILL,
    UIET_P1_ENABLED: process.env.UIET_P1_ENABLED,
  }, "flags")
  return cachedFlags
}

/**
 * Read & validate ALL UIET-P1 env vars. Safe to call repeatedly — result cached.
 *
 * Falls back to fail-soft defaults during `NEXT_PHASE=phase-production-build`
 * so that `next build` does not crash when secrets are absent at compile time.
 */
export function getEnv(): UietEnv {
  if (cached) return cached
  cached = parseOrThrow(envSchema, {
    ORCID_CLIENT_ID: process.env.ORCID_CLIENT_ID,
    ORCID_CLIENT_SECRET: process.env.ORCID_CLIENT_SECRET,
    ORCID_REDIRECT_URI: process.env.ORCID_REDIRECT_URI,
    IDENTITY_COOKIE_SECRET: process.env.IDENTITY_COOKIE_SECRET,
    ORCID_STATE_SECRET: process.env.ORCID_STATE_SECRET,
    EVENT_IP_HASH_SALT_SEED: process.env.EVENT_IP_HASH_SALT_SEED,
    ENABLE_ORCID_OJS_BACKFILL: process.env.ENABLE_ORCID_OJS_BACKFILL,
    UIET_P1_ENABLED: process.env.UIET_P1_ENABLED,
  }, "UIET-P1")
  return cached
}

/**
 * Non-throwing availability probe for the ORCID sign-in stack.
 *
 * Unlike getOrcidEnv()/getIdentityEnv(), this NEVER throws (even in
 * production with missing secrets) and is never cached — it is a plain
 * truthy check on process.env so routes can degrade gracefully instead
 * of surfacing a 500 to anonymous visitors.
 */
export function isOrcidConfigured(): boolean {
  return Boolean(
    process.env.ORCID_CLIENT_ID &&
      process.env.ORCID_CLIENT_SECRET &&
      process.env.ORCID_STATE_SECRET &&
      process.env.IDENTITY_COOKIE_SECRET
  )
}

/** Derived: the ORCID callback URL, computed from NEXT_PUBLIC_APP_URL when not set explicitly. */
export function getOrcidRedirectUri(): string {
  const env = getOrcidEnv()
  if (env.ORCID_REDIRECT_URI) return env.ORCID_REDIRECT_URI
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"
  return `${appUrl}/api/auth/orcid/callback`
}

/** Reset all caches — TEST ONLY. */
export function __resetEnvCacheForTests() {
  cached = null
  cachedMetrics = null
  cachedIdentity = null
  cachedOrcid = null
  cachedFlags = null
  cachedNotify = null
}
