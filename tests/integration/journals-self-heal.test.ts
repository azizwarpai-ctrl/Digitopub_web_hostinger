import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'

// ════════════════════════════════════════
// Mocks must be declared BEFORE importing the route under test
// ════════════════════════════════════════

vi.mock('@/src/lib/db/auth', () => ({
    getSession: vi.fn(() => null),
    createSession: vi.fn(),
    destroySession: vi.fn(),
}))

vi.mock('@/src/lib/db/config', () => ({
    prisma: {
        journal: {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
    },
}))

// Dynamic-import targets used by the self-heal path inside route.ts.
// vi.hoisted: route.ts now also reaches ojs-client through a static import
// chain (specialization route -> OJS sync queue), so the vi.mock factories
// can run before plain top-level consts are initialised.
const {
    ojsQueryMock,
    isOjsConfiguredMock,
    fetchFromDatabaseMock,
    syncOjsJournalsMock,
    computeFingerprintMock,
    getStoredFingerprintMock,
} = vi.hoisted(() => ({
    ojsQueryMock: vi.fn(),
    isOjsConfiguredMock: vi.fn(() => true),
    fetchFromDatabaseMock: vi.fn(),
    syncOjsJournalsMock: vi.fn(),
    computeFingerprintMock: vi.fn(),
    getStoredFingerprintMock: vi.fn(),
}))

vi.mock('@/src/features/ojs/server/ojs-client', () => ({
    ojsQuery: ojsQueryMock,
    isOjsConfigured: isOjsConfiguredMock,
}))
vi.mock('@/src/features/ojs/server/ojs-service', () => ({
    fetchFromDatabase: fetchFromDatabaseMock,
}))
vi.mock('@/src/features/ojs/server/sync-ojs-journals', () => ({
    syncOjsJournals: syncOjsJournalsMock,
    computeOjsJournalsFingerprint: computeFingerprintMock,
    getStoredJournalsFingerprint: getStoredFingerprintMock,
}))
// Ledger is best-effort observability; pass the job straight through.
vi.mock('@/src/features/ojs/server/sync-runs', () => ({
    withSyncRun: vi.fn(async (_job: string, _trigger: string, body: () => Promise<{ result: unknown }>) => {
        const outcome = await body()
        return outcome.result
    }),
}))
// The drift self-heal also refreshes snapshots (best-effort); stub it so these
// tests stay scoped to fingerprint/drift + journal sync and don't inflate the
// ojsQuery call count with the snapshot aggregate queries.
const refreshOjsJournalSnapshotsMock = vi.fn().mockResolvedValue({ refreshed: 0, skipped: true, watermark: null })
vi.mock('@/src/features/ojs/server/ojs-journal-snapshots', () => ({
    refreshOjsJournalSnapshots: refreshOjsJournalSnapshotsMock,
}))

// Import after mocks are wired.
import { journalRouter, __resetOjsDriftCheckStateForTests, __waitForOjsDriftCheckForTests } from '@/src/features/journals/server/route'
import { prisma } from '@/src/lib/db/config'

function createApp() {
    const app = new Hono().basePath('/api')
    app.route('/journals', journalRouter)
    return app
}

/** Awaits the pending fire-and-forget drift check (and any background sync
 *  it launched) via the route's test hook — deterministic, no sleeps.
 */
async function flushAsync(): Promise<void> {
    await __waitForOjsDriftCheckForTests()
}

const SYNC_RESULT = { synced: 0, errors: 0, deactivated: [] as string[] }

describe('Journals listing — OJS drift self-heal (fingerprint)', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        __resetOjsDriftCheckStateForTests()
        // 0 disables the feature; use 1ms so the throttle is effectively a
        // no-op for tests that fire a single request.
        process.env.OJS_DRIFT_CHECK_INTERVAL_MS = '1'
        delete process.env.OJS_DRIFT_FINGERPRINT
        isOjsConfiguredMock.mockReturnValue(true)
        fetchFromDatabaseMock.mockResolvedValue([])
        syncOjsJournalsMock.mockResolvedValue(SYNC_RESULT)
        computeFingerprintMock.mockResolvedValue('13:12345')
        getStoredFingerprintMock.mockResolvedValue('13:12345')
    })

    afterEach(async () => {
        // Drain any in-flight drift work so it cannot leak into the next test.
        await __waitForOjsDriftCheckForTests()
        delete process.env.OJS_DRIFT_CHECK_INTERVAL_MS
        delete process.env.OJS_DRIFT_FINGERPRINT
    })

    it('schedules a background sync when the OJS fingerprint differs from the stored one', async () => {
        vi.mocked(prisma.journal.findMany).mockResolvedValue([
            { id: BigInt(1), title: 'jod', field: 'X', status: 'active', created_at: new Date() } as any,
        ])
        vi.mocked(prisma.journal.count).mockResolvedValue(11)
        computeFingerprintMock.mockResolvedValue('12:99999')
        getStoredFingerprintMock.mockResolvedValue('11:11111')

        const app = createApp()
        const res = await app.request('/api/journals')

        expect(res.status).toBe(200)
        await flushAsync()

        expect(computeFingerprintMock).toHaveBeenCalledTimes(1)
        expect(fetchFromDatabaseMock).toHaveBeenCalledTimes(1)
        expect(fetchFromDatabaseMock).toHaveBeenCalledWith(true)
        expect(syncOjsJournalsMock).toHaveBeenCalledTimes(1)
        expect(syncOjsJournalsMock).toHaveBeenCalledWith([], { deactivateMissing: true })
    })

    it('does not trigger a sync when the fingerprint matches the stored one', async () => {
        vi.mocked(prisma.journal.findMany).mockResolvedValue([
            { id: BigInt(1), title: 'jod', field: 'X', status: 'active', created_at: new Date() } as any,
        ])
        vi.mocked(prisma.journal.count).mockResolvedValue(11)

        const app = createApp()
        const res = await app.request('/api/journals')

        expect(res.status).toBe(200)
        await flushAsync()

        expect(computeFingerprintMock).toHaveBeenCalledTimes(1)
        expect(fetchFromDatabaseMock).not.toHaveBeenCalled()
        expect(syncOjsJournalsMock).not.toHaveBeenCalled()
    })

    it('REGRESSION: detects drift when the count is unchanged but content changed (old count-only check missed this)', async () => {
        vi.mocked(prisma.journal.findMany).mockResolvedValue([
            { id: BigInt(1), title: 'jod', field: 'X', status: 'active', created_at: new Date() } as any,
        ])
        vi.mocked(prisma.journal.count).mockResolvedValue(13)
        // Same row count (13) on both sides, different CRC32 sum — e.g. a
        // journal was disabled or its path edited in OJS.
        computeFingerprintMock.mockResolvedValue('13:22222')
        getStoredFingerprintMock.mockResolvedValue('13:11111')

        const app = createApp()
        const res = await app.request('/api/journals')

        expect(res.status).toBe(200)
        await flushAsync()

        expect(syncOjsJournalsMock).toHaveBeenCalledTimes(1)
    })

    it('is fully disabled when OJS_DRIFT_CHECK_INTERVAL_MS is 0', async () => {
        vi.mocked(prisma.journal.findMany).mockResolvedValue([])
        vi.mocked(prisma.journal.count).mockResolvedValue(11)
        computeFingerprintMock.mockResolvedValue('12:99999')
        getStoredFingerprintMock.mockResolvedValue('11:11111')

        process.env.OJS_DRIFT_CHECK_INTERVAL_MS = '0'
        __resetOjsDriftCheckStateForTests()

        const app = createApp()
        const res = await app.request('/api/journals')

        expect(res.status).toBe(200)
        await flushAsync()

        // 0 means "disable the self-heal" — no fingerprint read, no sync,
        // even when a real drift exists.
        expect(computeFingerprintMock).not.toHaveBeenCalled()
        expect(fetchFromDatabaseMock).not.toHaveBeenCalled()
        expect(syncOjsJournalsMock).not.toHaveBeenCalled()
    })

    it('does not trigger a sync when OJS is not configured', async () => {
        vi.mocked(prisma.journal.findMany).mockResolvedValue([])
        vi.mocked(prisma.journal.count).mockResolvedValue(5)
        isOjsConfiguredMock.mockReturnValue(false)

        const app = createApp()
        const res = await app.request('/api/journals')

        expect(res.status).toBe(200)
        await flushAsync()

        expect(computeFingerprintMock).not.toHaveBeenCalled()
        expect(syncOjsJournalsMock).not.toHaveBeenCalled()
    })

    it('respects the throttle window: two requests within TTL trigger only one drift check', async () => {
        vi.mocked(prisma.journal.findMany).mockResolvedValue([
            { id: BigInt(1), title: 'jod', field: 'X', status: 'active', created_at: new Date() } as any,
        ])
        vi.mocked(prisma.journal.count).mockResolvedValue(11)

        // Re-enable throttling for this test only.
        process.env.OJS_DRIFT_CHECK_INTERVAL_MS = '60000'
        __resetOjsDriftCheckStateForTests()

        const app = createApp()
        await app.request('/api/journals')
        await flushAsync()
        await app.request('/api/journals')
        await flushAsync()

        // Second request is inside the throttle window → drift check skipped.
        expect(computeFingerprintMock).toHaveBeenCalledTimes(1)
    })

    it('listing response is returned before the background sync resolves', async () => {
        vi.mocked(prisma.journal.findMany).mockResolvedValue([])
        vi.mocked(prisma.journal.count).mockResolvedValue(11)
        computeFingerprintMock.mockResolvedValue('12:99999')
        getStoredFingerprintMock.mockResolvedValue('11:11111')

        // Make sync hang so we can prove it doesn't gate the response.
        let resolveSync: (v: typeof SYNC_RESULT) => void = () => {}
        const pendingSync = new Promise<typeof SYNC_RESULT>((resolve) => {
            resolveSync = resolve
        })
        syncOjsJournalsMock.mockReturnValue(pendingSync)

        const app = createApp()
        const res = await app.request('/api/journals')

        // Response is already 200 — the long-running sync has not been awaited.
        expect(res.status).toBe(200)

        // Now let the background sync finish so the test doesn't leak.
        resolveSync({ synced: 1, errors: 0, deactivated: [] })
        await flushAsync()
    })

    it('legacy flag OJS_DRIFT_FINGERPRINT=0 falls back to the count-only comparison', async () => {
        vi.mocked(prisma.journal.findMany).mockResolvedValue([
            { id: BigInt(1), title: 'jod', field: 'X', status: 'active', created_at: new Date() } as any,
        ])
        vi.mocked(prisma.journal.count).mockResolvedValue(11)
        ojsQueryMock.mockResolvedValue([{ c: 12 }])

        process.env.OJS_DRIFT_FINGERPRINT = '0'
        __resetOjsDriftCheckStateForTests()

        const app = createApp()
        const res = await app.request('/api/journals')

        expect(res.status).toBe(200)
        await flushAsync()

        expect(ojsQueryMock).toHaveBeenCalledTimes(1)
        expect(ojsQueryMock.mock.calls[0][0]).toMatch(/COUNT\(\*\)/i)
        expect(computeFingerprintMock).not.toHaveBeenCalled()
        expect(syncOjsJournalsMock).toHaveBeenCalledTimes(1)
    })
})
