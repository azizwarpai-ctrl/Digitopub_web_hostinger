import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'

// Admin password recovery (#165 part B). Mocks follow auth-otp-hygiene.test.ts.

vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/src/lib/db/auth', () => ({ getSession: vi.fn(), createSession: vi.fn(), destroySession: vi.fn() }))
vi.mock('@/src/lib/db/users', () => ({ verifyPassword: vi.fn(), getUserById: vi.fn() }))
vi.mock('@/src/features/auth/server/send-otp-email', () => ({ sendOtpEmail: vi.fn() }))
vi.mock('@/src/features/auth/server/send-reset-email', () => ({ sendResetEmail: vi.fn() }))
vi.mock('@/src/lib/db/config', () => {
  const p: any = {
    verificationCode: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    adminUser: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  }
  // Interactive transactions get the same mocked client as `tx`.
  p.$transaction = vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(p) : Promise.all(arg)))
  return { prisma: p }
})

import { Hono } from 'hono'
import { authRouter } from '@/src/features/auth/server/route'
import { prisma } from '@/src/lib/db/config'
import { sendResetEmail } from '@/src/features/auth/server/send-reset-email'
import { __resetRateLimiterForTests } from '@/src/lib/rate-limiter'

const USER = { id: BigInt(7), email: 'admin@example.com', full_name: 'Admin', role: 'admin' }
const GENERIC = 'If an account exists for this email, a reset link has been sent.'
const INVALID_LINK = 'This reset link is invalid or has expired.'

function createApp() {
  const app = new Hono().basePath('/api')
  app.route('/auth', authRouter)
  return app
}

const post = (app: ReturnType<typeof createApp>, path: string, body: unknown, ip = '203.0.113.5') =>
  app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) })

/** Request a reset for USER and return the link's id/token as the email would carry them. */
async function requestLink(app: ReturnType<typeof createApp>) {
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(USER as any)
  const res = await post(app, '/api/auth/forgot-password', { email: USER.email })
  expect(res.status).toBe(200)
  const link = new URL(vi.mocked(sendResetEmail).mock.calls.at(-1)![1] as string)
  const stored = vi.mocked(prisma.passwordResetToken.create).mock.calls.at(-1)![0] as any
  return { id: link.searchParams.get('id')!, token: link.searchParams.get('token')!, link, stored }
}

describe('Admin password recovery (#165)', () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimiterForTests()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://digitopub.example')
    app = createApp()
    vi.mocked(sendResetEmail).mockResolvedValue({ success: true })
    vi.mocked(prisma.passwordResetToken.create).mockImplementation((async (args: any) => ({ id: BigInt(42), ...args.data })) as any)
    vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.passwordResetToken.update).mockResolvedValue({} as any)
    vi.mocked(prisma.adminUser.update).mockResolvedValue({} as any)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('POST /auth/forgot-password', () => {
    it('returns the same generic message for known and unknown emails (no enumeration)', async () => {
      vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce(USER as any)
      const known = await (await post(app, '/api/auth/forgot-password', { email: USER.email })).json()
      vi.mocked(prisma.adminUser.findUnique).mockResolvedValueOnce(null)
      const unknown = await (await post(app, '/api/auth/forgot-password', { email: 'nobody@example.com' }, '198.51.100.9')).json()
      expect(known).toEqual({ success: true, message: GENERIC })
      expect(unknown).toEqual(known)
    })

    it('emails a link only when the account exists', async () => {
      vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null)
      await post(app, '/api/auth/forgot-password', { email: 'nobody@example.com' })
      expect(sendResetEmail).not.toHaveBeenCalled()
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled()

      const { link } = await requestLink(app)
      expect(sendResetEmail).toHaveBeenCalledTimes(1)
      expect(vi.mocked(sendResetEmail).mock.calls[0][0]).toBe(USER.email)
      expect(link.origin + link.pathname).toBe('https://digitopub.example/admin/reset-password')
    })

    it('stores only a bcrypt hash of the secret, expiring in 15 minutes', async () => {
      const before = Date.now()
      const { token, stored } = await requestLink(app)
      expect(token.length).toBeGreaterThanOrEqual(43) // 32 random bytes, base64url
      expect(stored.data.token_hash).not.toContain(token)
      expect(await bcrypt.compare(token, stored.data.token_hash)).toBe(true)
      const ttl = new Date(stored.data.expires_at).getTime() - before
      expect(ttl).toBeGreaterThan(14 * 60 * 1000)
      expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000 + 1000)
    })

    it('invalidates the user’s earlier open links when a new one is issued', async () => {
      await requestLink(app)
      const call = vi.mocked(prisma.passwordResetToken.updateMany).mock.calls[0][0] as any
      expect(call.where).toMatchObject({ user_id: USER.id, used_at: null })
      expect(call.data.used_at).toBeInstanceOf(Date)
    })

    it('still answers generically when the email fails to send', async () => {
      vi.mocked(sendResetEmail).mockResolvedValue({ success: false, error: 'SMTP down' })
      vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(USER as any)
      const body = await (await post(app, '/api/auth/forgot-password', { email: USER.email })).json()
      expect(body).toEqual({ success: true, message: GENERIC })
    })

    it('limits each email to 3 requests per hour (across IPs)', async () => {
      vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(USER as any)
      for (let i = 0; i < 3; i++) {
        expect((await post(app, '/api/auth/forgot-password', { email: USER.email }, `203.0.113.${10 + i}`)).status).toBe(200)
      }
      const res = await post(app, '/api/auth/forgot-password', { email: 'ADMIN@example.com' }, '203.0.113.99')
      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBeTruthy()
    })

    it('limits each IP to 10 requests per hour (across emails)', async () => {
      vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null)
      for (let i = 0; i < 10; i++) {
        expect((await post(app, '/api/auth/forgot-password', { email: `user${i}@example.com` })).status).toBe(200)
      }
      expect((await post(app, '/api/auth/forgot-password', { email: 'user99@example.com' })).status).toBe(429)
    })

    it('rejects a malformed email', async () => {
      expect((await post(app, '/api/auth/forgot-password', { email: 'not-an-email' })).status).toBe(400)
    })
  })

  describe('POST /auth/reset-password', () => {
    const NEW = { password: 'brand-new-pass', confirmPassword: 'brand-new-pass' }

    /** The atomic claim: updateMany on this id, only while unused and unexpired. */
    const claimCall = (id: string) =>
      vi.mocked(prisma.passwordResetToken.updateMany).mock.calls.map((c) => c[0] as any).find((a) => a.where.id === BigInt(id))

    it('sets the new password and consumes the link atomically', async () => {
      const { id, token, stored } = await requestLink(app)
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({ id: BigInt(id), user_id: USER.id, used_at: null, ...stored.data } as any)
      vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 1 } as any)
      const res = await post(app, '/api/auth/reset-password', { id, token, ...NEW })
      expect(res.status).toBe(200)
      const claim = claimCall(id)
      expect(claim.where).toMatchObject({ used_at: null })
      expect(claim.where.expires_at.gt).toBeInstanceOf(Date)
      expect(claim.data.used_at).toBeInstanceOf(Date)
      const upd = vi.mocked(prisma.adminUser.update).mock.calls[0][0] as any
      expect(upd.where).toEqual({ id: USER.id })
      expect(await bcrypt.compare(NEW.password, upd.data.password_hash)).toBe(true)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('lets only one of two concurrent uses win (claim affects 0 rows -> rejected)', async () => {
      const { id, token, stored } = await requestLink(app)
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({ id: BigInt(id), user_id: USER.id, used_at: null, ...stored.data } as any)
      vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 0 } as any) // another request claimed it
      const res = await post(app, '/api/auth/reset-password', { id, token, ...NEW })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ success: false, error: INVALID_LINK })
      expect(prisma.adminUser.update).not.toHaveBeenCalled()
    })

    it.each([
      ['a wrong secret', (r: any) => r, 'x'.repeat(43)],
      ['an already used link', (r: any) => ({ ...r, used_at: new Date() }), null],
      ['an expired link', (r: any) => ({ ...r, expires_at: new Date(Date.now() - 1000) }), null],
    ])('rejects %s with the same generic error', async (_, mutate, wrongToken) => {
      const { id, token, stored } = await requestLink(app)
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(mutate({ id: BigInt(id), user_id: USER.id, used_at: null, ...stored.data }) as any)
      const res = await post(app, '/api/auth/reset-password', { id, token: wrongToken ?? token, ...NEW })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ success: false, error: INVALID_LINK })
      expect(prisma.adminUser.update).not.toHaveBeenCalled()
    })

    it('rejects an unknown link id with the same generic error', async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(null)
      const res = await post(app, '/api/auth/reset-password', { id: '999', token: 'y'.repeat(43), ...NEW })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ success: false, error: INVALID_LINK })
    })

    it('rejects mismatched or too-short passwords before touching the database', async () => {
      const mismatch = await post(app, '/api/auth/reset-password', { id: '1', token: 'z'.repeat(43), password: 'abcdefg', confirmPassword: 'abcdefh' })
      const short = await post(app, '/api/auth/reset-password', { id: '1', token: 'z'.repeat(43), password: 'abc', confirmPassword: 'abc' })
      expect(mismatch.status).toBe(400)
      expect(short.status).toBe(400)
      expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled()
    })
  })
})
