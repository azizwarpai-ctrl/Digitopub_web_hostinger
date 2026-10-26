import { describe, it, expect, vi, beforeEach } from 'vitest'

// ════════════════════════════════════════
// Mock all external dependencies BEFORE importing routes
// ════════════════════════════════════════

// Mock server-only modules
vi.mock('next/headers', () => ({
    cookies: vi.fn(),
    headers: vi.fn(),
}))

vi.mock('server-only', () => ({}))

import { authRouter } from '@/src/features/auth/server/route'
import { ojsRouter } from '@/src/features/ojs/server/route'
import { journalRouter } from '@/src/features/journals/server/route'
import { solutionRouter } from '@/src/features/solutions/server/route'
import { messageRouter } from '@/src/features/messages/server'
import { prisma } from '@/src/lib/db/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

let mockSession: any = null

vi.mock('@/src/lib/db/auth', () => ({
    getSession: vi.fn(() => mockSession),
    createSession: vi.fn(),
    destroySession: vi.fn(),
}))

vi.mock('@/src/lib/db/config', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        // #234: journal create validates `field` against the managed list.
        journalSpecialization: {
            findFirst: vi.fn().mockResolvedValue({ id: BigInt(1), name: 'CS', is_active: true }),
        },
        journal: {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
        message: {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
        solution: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        systemSetting: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}))

function createApp() {
    const app = new Hono().basePath("/api")

    // Global CORS middleware
    app.use(
        "*",
        cors({
            origin: (origin) => {
                const allowed = process.env.ALLOWED_ORIGINS?.split(",") || []
                if (allowed.includes(origin)) return origin
                return null
            },
        })
    )

    // Session middleware
    app.use('*', async (c: any, next) => {
        c.set('session', mockSession)
        await next()
    })

    // Header middleware to mirror production app.ts
    app.use('*', async (c, next) => {
        await next()
        c.res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate")
        c.res.headers.set("Pragma", "no-cache")
    })

    app.route('/auth', authRouter)
    app.route('/ojs', ojsRouter)
    app.route('/journals', journalRouter)
    app.route('/messages', messageRouter)
    app.route('/solutions', solutionRouter)
    return app
}

describe('Security & Authorization Tests', () => {
    let app: ReturnType<typeof createApp>

    beforeEach(() => {
        vi.resetAllMocks()
        mockSession = null
        app = createApp()
    })

    describe('CORS and Global Configuration', () => {
        it('should allow allowed origins', async () => {
            process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://submitmanager.com'
            const res = await app.request('/api/auth/me', {
                headers: { 'Origin': 'https://submitmanager.com' }
            })
            expect(res.headers.get('access-control-allow-origin')).toBe('https://submitmanager.com')
        })

        it('should emit anti-cache headers for all API requests', async () => {
            const res = await app.request('/api/auth/me')
            expect(res.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate')
            expect(res.headers.get('Pragma')).toBe('no-cache')
        })
    })

    // ═══════════════════════════════════════
    // SUPERADMIN ROLE TESTS (M-2)
    // ═══════════════════════════════════════
    describe('Superadmin role access', () => {
        it('should allow superadmin to create journals', async () => {
            mockSession = { id: '1', email: 'admin@digstobob.com', role: 'superadmin', full_name: 'Super Admin' }
            const mockJournal = {
                id: BigInt(1), title: 'New Journal', field: 'CS',
                status: 'active', created_at: new Date(), created_by: BigInt(1),
            }
            vi.mocked(prisma.journal.create).mockResolvedValue(mockJournal as any)
            vi.mocked(prisma.journalSpecialization.findFirst).mockResolvedValue({ id: BigInt(1), name: 'CS', is_active: true } as any)

            const res = await app.request('/api/journals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'New Journal', field: 'CS' }),
            })
            expect(res.status).toBe(201)
        })

        it('should allow superadmin to delete journals', async () => {
            mockSession = { id: '1', email: 'admin@digstobob.com', role: 'superadmin', full_name: 'Super Admin' }
            vi.mocked(prisma.journal.findUnique).mockResolvedValue({ id: BigInt(1) } as any)
            vi.mocked(prisma.journal.delete).mockResolvedValue({} as any)

            const res = await app.request('/api/journals/1', { method: 'DELETE' })
            expect(res.status).toBe(200)
        })

        it('should allow superadmin to list messages', async () => {
            mockSession = { id: '1', email: 'admin@digstobob.com', role: 'superadmin', full_name: 'Super Admin' }
            vi.mocked(prisma.message.findMany).mockResolvedValue([])
            vi.mocked(prisma.message.count).mockResolvedValue(0)

            const res = await app.request('/api/messages')
            expect(res.status).toBe(200)
        })

        it('should allow superadmin to create solutions', async () => {
            mockSession = { id: '1', email: 'admin@digstobob.com', role: 'superadmin', full_name: 'Super Admin' }
            const mockSolution = {
                id: BigInt(1), title: 'Title', description: 'Desc',
                icon: 'Globe', features: [], is_published: false,
                display_order: 1, created_at: new Date(), updated_at: new Date(),
            }
            vi.mocked(prisma.solution.create).mockResolvedValue(mockSolution as any)

            const res = await app.request('/api/solutions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'How?', description: 'Like this.' }),
            })
            expect(res.status).toBe(201)
        })

        it('should allow superadmin to delete messages', async () => {
            mockSession = { id: '1', email: 'admin@digstobob.com', role: 'superadmin', full_name: 'Super Admin' }
            vi.mocked(prisma.message.findUnique).mockResolvedValue({ id: BigInt(1) } as any)
            vi.mocked(prisma.message.delete).mockResolvedValue({} as any)

            const res = await app.request('/api/messages/1', { method: 'DELETE' })
            expect(res.status).toBe(200)
        })
    })

    // ═══════════════════════════════════════
    // SUPPORT ROLE TESTS
    // ═══════════════════════════════════════
    describe('Support role restrictions', () => {
        it('should reject support user from creating journals', async () => {
            mockSession = { id: '2', email: 'support@digstobob.com', role: 'support', full_name: 'Support' }

            const res = await app.request('/api/journals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'New Journal', field: 'CS' }),
            })
            expect(res.status).toBe(403)
        })

        it('should reject support user from deleting journals', async () => {
            mockSession = { id: '2', email: 'support@digstobob.com', role: 'support', full_name: 'Support' }

            const res = await app.request('/api/journals/1', { method: 'DELETE' })
            expect(res.status).toBe(403)
        })

        it('should reject support user from listing messages', async () => {
            mockSession = { id: '2', email: 'support@digstobob.com', role: 'support', full_name: 'Support' }

            const res = await app.request('/api/messages')
            expect(res.status).toBe(403)
        })
    })

    // ═══════════════════════════════════════
    // SOLUTIONS DRAFT VISIBILITY (C-3 fix)
    // ═══════════════════════════════════════
    describe('Solutions draft visibility by role', () => {
        it('should show only published solutions to unauthenticated users', async () => {
            mockSession = null
            vi.mocked(prisma.solution.findMany).mockResolvedValue([])
            vi.mocked(prisma.solution.count).mockResolvedValue(0)

            await app.request('/api/solutions')

            expect(prisma.solution.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { is_published: true },
                })
            )
        })

        it('should show only published solutions to author-role users', async () => {
            mockSession = { id: '3', email: 'author@test.com', role: 'author', full_name: 'Author' }
            vi.mocked(prisma.solution.findMany).mockResolvedValue([])
            vi.mocked(prisma.solution.count).mockResolvedValue(0)

            await app.request('/api/solutions')

            expect(prisma.solution.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { is_published: true },
                })
            )
        })

        it('should show only published solutions to support-role users', async () => {
            mockSession = { id: '2', email: 'support@digstobob.com', role: 'support', full_name: 'Support' }
            vi.mocked(prisma.solution.findMany).mockResolvedValue([])
            vi.mocked(prisma.solution.count).mockResolvedValue(0)

            await app.request('/api/solutions')

            expect(prisma.solution.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { is_published: true },
                })
            )
        })

        it('should show all solutions (including drafts) to admin users', async () => {
            mockSession = { id: '1', email: 'admin@test.com', role: 'admin', full_name: 'Admin' }
            vi.mocked(prisma.solution.findMany).mockResolvedValue([])
            vi.mocked(prisma.solution.count).mockResolvedValue(0)

            await app.request('/api/solutions')

            expect(prisma.solution.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {},
                })
            )
        })

        it('should show all solutions (including drafts) to superadmin users', async () => {
            mockSession = { id: '1', email: 'admin@digstobob.com', role: 'superadmin', full_name: 'Super Admin' }
            vi.mocked(prisma.solution.findMany).mockResolvedValue([])
            vi.mocked(prisma.solution.count).mockResolvedValue(0)

            await app.request('/api/solutions')

            expect(prisma.solution.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {},
                })
            )
        })

        it('should hide draft solution from author viewing by ID', async () => {
            mockSession = { id: '3', email: 'author@test.com', role: 'author', full_name: 'Author' }
            vi.mocked(prisma.solution.findUnique).mockResolvedValue({
                id: BigInt(1), title: 'T', description: 'D',
                is_published: false,
                created_at: new Date(), updated_at: new Date(),
            } as any)

            const res = await app.request('/api/solutions/1')
            expect(res.status).toBe(404)
        })

        it('should show draft solution to superadmin viewing by ID', async () => {
            mockSession = { id: '1', email: 'admin@digstobob.com', role: 'superadmin', full_name: 'Super Admin' }
            vi.mocked(prisma.solution.findUnique).mockResolvedValue({
                id: BigInt(1), title: 'T', description: 'D',
                is_published: false,
                created_at: new Date(), updated_at: new Date(),
            } as any)

            const res = await app.request('/api/solutions/1')
            expect(res.status).toBe(200)
        })
    })

    // ═══════════════════════════════════════
    // MESSAGE PATCH EDGE CASES (M-4)
    // ═══════════════════════════════════════
    describe('Message PATCH edge cases', () => {
        it('should accept PATCH with valid status update', async () => {
            mockSession = { id: '1', email: 'admin@test.com', role: 'admin', full_name: 'Admin' }
            vi.mocked(prisma.message.findUnique).mockResolvedValue({ id: BigInt(1) } as any)
            vi.mocked(prisma.message.update).mockResolvedValue({
                id: BigInt(1), name: 'Test', email: 'test@test.com',
                subject: 'Hello', message: 'World', message_type: 'general',
                status: 'read', created_at: new Date(), updated_at: new Date(),
            } as any)

            const res = await app.request('/api/messages/1', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'read' }),
            })
            expect(res.status).toBe(200)
        })

        it('should accept PATCH with empty body (no-op update)', async () => {
            mockSession = { id: '1', email: 'admin@test.com', role: 'admin', full_name: 'Admin' }
            vi.mocked(prisma.message.findUnique).mockResolvedValue({ id: BigInt(1) } as any)
            vi.mocked(prisma.message.update).mockResolvedValue({
                id: BigInt(1), name: 'Test', email: 'test@test.com',
                subject: 'Hello', message: 'World', message_type: 'general',
                status: 'unread', created_at: new Date(), updated_at: new Date(),
            } as any)

            const res = await app.request('/api/messages/1', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            })
            expect(res.status).toBe(200)
        })

        it('should reject PATCH with invalid status value', async () => {
            mockSession = { id: '1', email: 'admin@test.com', role: 'admin', full_name: 'Admin' }

            const res = await app.request('/api/messages/1', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'invalid_status' }),
            })
            expect(res.status).toBe(400)
        })
    })

    // ═══════════════════════════════════════
    // INPUT VALIDATION EDGE CASES
    // ═══════════════════════════════════════
    describe('Input validation edge cases', () => {
        it('should return 404 for negative journal ID (treated as slug)', async () => {
            // With slug-based routing, "-1" is a valid identifier string that gets looked up and not found
            vi.mocked(prisma.journal.findFirst).mockResolvedValue(null)
            vi.mocked(prisma.journal.findUnique).mockResolvedValue(null)

            const res = await app.request('/api/journals/-1')
            expect(res.status).toBe(404)
        })

        it('should return 404 for journal ID with special characters (treated as slug)', async () => {
            // With slug-based routing, special chars are accepted as slugs and looked up
            vi.mocked(prisma.journal.findFirst).mockResolvedValue(null)
            vi.mocked(prisma.journal.findUnique).mockResolvedValue(null)

            const res = await app.request('/api/journals/1;DROP%20TABLE')
            expect(res.status).toBe(404)
        })

        it('should reject extremely long journal title', async () => {
            mockSession = { id: '1', email: 'admin@test.com', role: 'admin', full_name: 'Admin' }

            const res = await app.request('/api/journals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'A'.repeat(501), field: 'CS' }),
            })
            expect(res.status).toBe(400)
        })

        it('should accept message with XSS in subject (sanitization is display-side)', async () => {
            // XSS content is accepted at API level (stored as-is)
            // Sanitization is the responsibility of the frontend during display.
            const xssSubject = '<script>alert("xss")</script>'
            const mockMessage = {
                id: BigInt(1), name: 'Test', email: 'test@test.com',
                subject: xssSubject, message: 'Content',
                message_type: 'general', status: 'unread',
                created_at: new Date(), updated_at: new Date(),
            }
            vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)

            const res = await app.request('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Test User',
                    email: 'test@example.com',
                    subject: xssSubject,
                    message: 'Test message content',
                }),
            })
            expect(res.status).toBe(201)
        })

        it('should reject solution with empty title', async () => {
            mockSession = { id: '1', email: 'admin@test.com', role: 'admin', full_name: 'Admin' }

            const res = await app.request('/api/solutions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: '', description: 'Some answer' }),
            })
            expect(res.status).toBe(400)
        })

        it('should reject pagination with non-numeric page', async () => {
            vi.mocked(prisma.journal.findMany).mockResolvedValue([])
            vi.mocked(prisma.journal.count).mockResolvedValue(0)

            const res = await app.request('/api/journals?page=abc&limit=10')
            expect(res.status).toBe(200) // Should still succeed with defaults

            const body = await res.json()
            expect(body.pagination.page).toBe(1) // Falls back to default
        })

        it('should cap pagination limit to maxLimit', async () => {
            vi.mocked(prisma.journal.findMany).mockResolvedValue([])
            vi.mocked(prisma.journal.count).mockResolvedValue(0)

            await app.request('/api/journals?page=1&limit=999')

            expect(prisma.journal.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    take: 100, // Capped at maxLimit
                })
            )
        })
    })
})
