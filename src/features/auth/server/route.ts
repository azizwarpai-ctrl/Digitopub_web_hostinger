import { Hono } from "hono"
import type { Context } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import bcrypt from "bcryptjs"
import {
  resolveOtpDelivery,
  deliverOtpToConsole,
  generateOTPCode,
  OtpDeliveryUnconfiguredError,
} from "@/src/features/auth/utils/auth-utils.server"
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from "../schemas/auth-schema"
import { randomBytes } from "node:crypto"
import { sendResetEmail } from "./send-reset-email"
import { verifyPassword, getUserById } from "@/src/lib/db/users"
import { createSession, getSession, destroySession } from "@/src/lib/db/auth"
import { prisma } from "@/src/lib/db/config"
import { sendOtpEmail } from "./send-otp-email"
import { checkRateLimit, type RateLimitResult } from "@/src/lib/rate-limiter"
import {
  ADMIN_LOGIN_RATE_LIMIT,
  OTP_RESEND_RATE_LIMIT,
  OTP_VERIFY_RATE_LIMIT,
  PASSWORD_RESET_EMAIL_RATE_LIMIT,
  PASSWORD_RESET_IP_RATE_LIMIT,
  PASSWORD_RESET_CONSUME_RATE_LIMIT,
} from "@/src/lib/rate-limiter-configs"
import { clientIpFromHeaders } from "@/src/lib/ip-hash"

/** Extended type for verification codes that includes custom lockout fields */
interface VerificationCodeRecord {
  id: bigint
  user_id: bigint
  email: string
  code: string
  used: boolean
  expires_at: Date
  created_at: Date
  attempts: number | null
  locked_until: Date | null
  last_failed_at: Date | null
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return "***"
  const visiblePrefix = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1)
  return `${visiblePrefix}***@${domain}`
}

const app = new Hono()

/** 429 helper: sets Retry-After and returns the standard error body. */
function tooManyAttempts(c: Context, rate: RateLimitResult) {
  c.res.headers.set("Retry-After", String(rate.retryAfter))
  return c.json({ success: false, error: "Too many attempts. Please try again later." }, 429)
}

/**
 * Resolve OTP delivery config, mapping OtpDeliveryUnconfiguredError to a 503
 * response. Returns either the delivery config or a Response to short-circuit.
 * MUST be called before generating/persisting any verification code.
 */
function resolveOtpDeliveryOr503(c: Context): ReturnType<typeof resolveOtpDelivery> | Response {
  try {
    return resolveOtpDelivery()
  } catch (error) {
    if (error instanceof OtpDeliveryUnconfiguredError) {
      console.error(`[OTP] ${error.message}`)
      return c.json({
        success: false,
        error: "OTP delivery is not configured. Contact the site operator.",
      }, 503)
    }
    throw error
  }
}

// POST /auth/login
app.post("/login", zValidator("json", loginSchema), async (c) => {
  try {
    const rate = checkRateLimit(clientIpFromHeaders(c.req.raw.headers), ADMIN_LOGIN_RATE_LIMIT)
    if (!rate.allowed) {
      return tooManyAttempts(c, rate)
    }

    const { email, password } = c.req.valid("json")
    const user = await verifyPassword(email, password)

    if (!user) {
      return c.json({ success: false, error: "Invalid email or password" }, 401)
    }

    // Resolve delivery config BEFORE generating/persisting a code —
    // fails closed (503) in production when delivery is unconfigured.
    const delivery = resolveOtpDeliveryOr503(c)
    if (delivery instanceof Response) return delivery

    if (delivery.method === 'disabled') {
      return c.json({
        success: false,
        error: "OTP delivery is currently disabled for security. Please contact the administrator."
      }, 503)
    }

    // Generate OTP code
    const code = generateOTPCode()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    // Invalidate any existing codes for this user
    await prisma.verificationCode.updateMany({
      where: { email: user.email, used: false },
      data: { used: true },
    })

    // Hash the code before storing
    const hashedCode = await bcrypt.hash(code, 10)

    // Store the new verification code
    await prisma.verificationCode.create({
      data: {
        user_id: BigInt(user.id),
        email: user.email,
        code: hashedCode,
        expires_at: expiresAt,
      },
    })

    if (delivery.method === 'console') {
      deliverOtpToConsole(user.email, code)
      console.log(`[OTP] Verification generated for ${maskEmail(user.email)}`)
    } else {
      const emailResult = await sendOtpEmail(user.email, code)
      if (!emailResult.success) {
        console.error(`[OTP] Failed to send verification email to ${maskEmail(user.email)}: ${emailResult.error}`)
        return c.json({
          success: false,
          error: "Failed to send verification code. Please try again.",
        }, 503)
      }
      console.log(`[OTP] Verification email sent to ${maskEmail(user.email)}`)
    }

    return c.json({
      success: true,
      requiresVerification: true,
      email: user.email,
      message: delivery.method === 'console'
        ? "Verification code generated in server console."
        : "Verification code sent to your email.",
    })
  } catch (error) {
    console.error("Login error:", error)
    return c.json({ success: false, error: "Authentication failed" }, 500)
  }
})

// POST /auth/verify-code
const verifyCodeSchema = z.object({
  email: z.email(),
  code: z.string().length(6),
})

app.post("/verify-code", zValidator("json", verifyCodeSchema), async (c) => {
  try {
    const rate = checkRateLimit(clientIpFromHeaders(c.req.raw.headers), OTP_VERIFY_RATE_LIMIT)
    if (!rate.allowed) {
      return tooManyAttempts(c, rate)
    }

    const { email, code } = c.req.valid("json")

    // Find the latest active verification code
    const verificationCode = await prisma.verificationCode.findFirst({
      where: {
        email,
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: "desc" },
    }) as VerificationCodeRecord | null

    if (!verificationCode) {
      return c.json({ success: false, error: "Invalid or expired verification code" }, 401)
    }

    // Check if locked
    if (verificationCode.locked_until && new Date() < verificationCode.locked_until) {
      return c.json({ success: false, error: "Invalid or expired verification code" }, 401)
    }

    // Constant time comparison would be better but bcrypt handle its own comparison
    const isCodeValid = await bcrypt.compare(code, verificationCode.code)

    if (!isCodeValid) {
      // Increment attempts
      const newAttempts = (verificationCode.attempts || 0) + 1

      // Escalating lockout policy
      let lockoutMinutes = 0
      if (newAttempts >= 15) {
        lockoutMinutes = 24 * 60 // 24 hours
      } else if (newAttempts >= 10) {
        lockoutMinutes = 60 // 1 hour
      } else if (newAttempts >= 5) {
        lockoutMinutes = 15 // 15 minutes
      }

      const lockoutTime = lockoutMinutes > 0 ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : null

      await prisma.verificationCode.update({
        where: { id: verificationCode.id },
        data: {
          attempts: newAttempts,
          last_failed_at: new Date(),
          locked_until: lockoutTime,
        },
      })

      return c.json({ success: false, error: "Invalid or expired verification code" }, 401)
    }

    // Mark code as used
    await prisma.verificationCode.update({
      where: { id: verificationCode.id },
      data: { used: true },
    })

    // Fetch the user and create a full session
    const user = await prisma.adminUser.findUnique({
      where: { email },
    })

    if (!user) {
      return c.json({ success: false, error: "User not found" }, 404)
    }

    await createSession({
      id: user.id.toString(),
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    })

    return c.json({
      success: true,
      user: { id: user.id.toString(), email: user.email, role: user.role },
    })
  } catch (error) {
    console.error("Verification error:", error)
    return c.json({ success: false, error: "Verification failed" }, 500)
  }
})

// POST /auth/resend-code
const resendCodeSchema = z.object({
  email: z.email(),
})

app.post("/resend-code", zValidator("json", resendCodeSchema), async (c) => {
  try {
    const { email } = c.req.valid("json")

    // Rate limit per IP + email
    const ip = clientIpFromHeaders(c.req.raw.headers)
    const rate = checkRateLimit(`${ip}:${email.toLowerCase()}`, OTP_RESEND_RATE_LIMIT)
    if (!rate.allowed) {
      return tooManyAttempts(c, rate)
    }

    // Resolve delivery config BEFORE any lookup or code generation —
    // fails closed (503) in production when delivery is unconfigured.
    const delivery = resolveOtpDeliveryOr503(c)
    if (delivery instanceof Response) return delivery

    if (delivery.method === 'disabled') {
      return c.json({ success: false, error: "OTP delivery is disabled." }, 503)
    }

    // Verify user exists
    const user = await prisma.adminUser.findUnique({ where: { email } })
    if (!user) {
      return c.json({ success: false, error: "User not found" }, 404)
    }

    // Invalidate existing codes
    await prisma.verificationCode.updateMany({
      where: { email, used: false },
      data: { used: true },
    })

    // Generate new code
    const code = generateOTPCode()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    const hashedCode = await bcrypt.hash(code, 10)

    await prisma.verificationCode.create({
      data: {
        user_id: user.id,
        email: user.email,
        code: hashedCode,
        expires_at: expiresAt,
      },
    })

    if (delivery.method === 'console') {
      deliverOtpToConsole(user.email, code)
      console.log(`[OTP] Resent verification for ${maskEmail(user.email)}`)
    } else {
      const emailResult = await sendOtpEmail(user.email, code)
      if (!emailResult.success) {
        console.error(`[OTP] Failed to resend verification email to ${maskEmail(user.email)}: ${emailResult.error}`)
        return c.json({
          success: false,
          error: "Failed to send verification code. Please try again.",
        }, 503)
      }
      console.log(`[OTP] Verification email resent to ${maskEmail(user.email)}`)
    }

    return c.json({
      success: true,
      message: delivery.method === 'console'
        ? "New verification code generated in server console."
        : "Verification code sent to your email.",
    })
  } catch (error) {
    console.error("Resend code error:", error)
    return c.json({ success: false, error: "Failed to resend code" }, 500)
  }
})


// POST /auth/logout
// ─── Admin password recovery (#165) ──────────────────────────────────────────
//
// Link = /admin/reset-password?id=<row id>&token=<32-byte secret, base64url>.
// Only bcrypt(secret) is stored; rows expire after 15 minutes and are
// single-use. Responses never reveal whether an account exists.

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000
const RESET_GENERIC_MESSAGE = "If an account exists for this email, a reset link has been sent."
const RESET_INVALID_LINK = "This reset link is invalid or has expired."
// Compared against when there is no such link, so that path costs about as
// much as a real one.
const DUMMY_RESET_HASH = bcrypt.hashSync(randomBytes(16).toString("hex"), 10)

class ResetLinkInvalidError extends Error {}

const pendingResetLinks = new Set<Promise<void>>()
/** Test helper: wait for reset links issued in the background. */
export async function __flushResetLinksForTests(): Promise<void> {
  await Promise.all(pendingResetLinks)
}

/** Create a single-use reset link for the user and email it. Never throws, never logs the link. */
async function issueResetLink(userId: bigint, email: string): Promise<void> {
  try {
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!configuredUrl && process.env.NODE_ENV === "production") {
      console.error("[PasswordReset] NEXT_PUBLIC_APP_URL is not set; no reset link issued")
      return
    }
    const appUrl = (configuredUrl || "http://localhost:3000").replace(/\/$/, "")

    const secret = randomBytes(32).toString("base64url")
    const tokenHash = await bcrypt.hash(secret, 10)
    const now = new Date()
    // One live link per user: issuing a new one retires the old ones.
    const row = await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { user_id: userId, used_at: null },
        data: { used_at: now },
      })
      return tx.passwordResetToken.create({
        data: { user_id: userId, token_hash: tokenHash, expires_at: new Date(now.getTime() + RESET_TOKEN_TTL_MS) },
      })
    })

    const resetUrl = `${appUrl}/admin/reset-password?id=${row.id.toString()}&token=${encodeURIComponent(secret)}`
    // Always email (never console), and never log the link or token.
    const result = await sendResetEmail(email, resetUrl)
    if (!result.success) {
      console.error(`[PasswordReset] Failed to send reset email to ${maskEmail(email)}: ${result.error}`)
      return
    }
    console.log(`[PasswordReset] Reset link issued for ${maskEmail(email)}`)
  } catch (error) {
    console.error(`[PasswordReset] Failed to issue reset link for ${maskEmail(email)}:`, error instanceof Error ? error.message : error)
  }
}

// POST /auth/forgot-password
app.post("/forgot-password", zValidator("json", forgotPasswordSchema), async (c) => {
  const email = c.req.valid("json").email.trim()

  const ip = clientIpFromHeaders(c.req.raw.headers)
  const byIp = checkRateLimit(ip, PASSWORD_RESET_IP_RATE_LIMIT)
  if (!byIp.allowed) return tooManyAttempts(c, byIp)
  const byEmail = checkRateLimit(email.toLowerCase(), PASSWORD_RESET_EMAIL_RATE_LIMIT)
  if (!byEmail.allowed) return tooManyAttempts(c, byEmail)

  try {
    const user = await prisma.adminUser.findUnique({ where: { email } })
    // Issued after the response, so known and unknown emails take the same time.
    if (user) {
      const pending = issueResetLink(user.id, user.email)
      pendingResetLinks.add(pending)
      void pending.finally(() => pendingResetLinks.delete(pending))
    }
  } catch (error) {
    // Still answer generically: an error must not reveal that the account exists.
    console.error("[PasswordReset] forgot-password failed:", error instanceof Error ? error.message : error)
  }

  return c.json({ success: true, message: RESET_GENERIC_MESSAGE }, 200)
})

// POST /auth/reset-password
app.post("/reset-password", zValidator("json", resetPasswordSchema), async (c) => {
  const rate = checkRateLimit(clientIpFromHeaders(c.req.raw.headers), PASSWORD_RESET_CONSUME_RATE_LIMIT)
  if (!rate.allowed) return tooManyAttempts(c, rate)

  const { id, token, password } = c.req.valid("json")
  const invalidLink = () => c.json({ success: false, error: RESET_INVALID_LINK }, 400)

  try {
    const row = await prisma.passwordResetToken.findUnique({ where: { id: BigInt(id) } })
    if (!row) {
      await bcrypt.compare(token, DUMMY_RESET_HASH)
      return invalidLink()
    }
    // Compare first, then check state, so every failure costs the same.
    const secretMatches = await bcrypt.compare(token, row.token_hash)
    if (!secretMatches || row.used_at || row.expires_at.getTime() <= Date.now()) {
      return invalidLink()
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      // Atomic claim: of two concurrent uses of one link, only one updates the row.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, used_at: null, expires_at: { gt: now } },
        data: { used_at: now },
      })
      if (claimed.count !== 1) throw new ResetLinkInvalidError()
      await tx.adminUser.update({ where: { id: row.user_id }, data: { password_hash: passwordHash } })
      // Retire any other open links for this user.
      await tx.passwordResetToken.updateMany({
        where: { user_id: row.user_id, used_at: null },
        data: { used_at: now },
      })
    })

    console.log(`[PasswordReset] Password reset completed for admin user ${row.user_id.toString()}`)
    return c.json({ success: true, message: "Your password has been reset. You can now log in." }, 200)
  } catch (error) {
    if (error instanceof ResetLinkInvalidError) return invalidLink()
    console.error("[PasswordReset] reset-password failed:", error instanceof Error ? error.message : error)
    return c.json({ success: false, error: "Could not reset your password. Please try again." }, 500)
  }
})

app.post("/logout", async (c) => {
  try {
    await destroySession()
    return c.json({ success: true })
  } catch (error) {
    console.error("Logout error:", error)
    return c.json({ success: false, error: "Logout failed" }, 500)
  }
})

// GET /auth/me
app.get("/me", async (c) => {
  try {
    const session = await getSession()

    if (!session) {
      return c.json({ success: false, error: "Not authenticated" }, 401)
    }

    const user = await getUserById(session.id)

    if (!user) {
      return c.json({ success: false, error: "User not found" }, 404)
    }

    return c.json({ success: true, user })
  } catch (error) {
    console.error("Failed to get user:", error)
    return c.json({ success: false, error: "Failed to get user" }, 500)
  }
})

export { app as authRouter }
