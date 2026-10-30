import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Hono } from "hono"

const findManyMock = vi.fn()
vi.mock("@/src/lib/db/config", () => ({
    prisma: {
        journal: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
        articleCitationCount: { get findMany() { return findManyMock } },
    },
}))
vi.mock("@/src/features/ojs/server/ojs-client", () => ({
    ojsQuery: vi.fn(),
    isOjsConfigured: vi.fn(() => false),
}))
vi.mock("@/src/server/routes/metrics-events", () => ({ metricsEventsRouter: new Hono() }))

const acquireJobLockMock = vi.fn()
vi.mock("@/src/lib/cron-lock", () => ({
    acquireJobLock: (...args: unknown[]) => acquireJobLockMock(...args),
}))
vi.mock("@/src/features/ojs/server/sync-runs", () => ({
    withSyncRun: async (_j: string, _t: string, body: () => Promise<{ result: unknown }>) => (await body()).result,
}))
vi.mock("@/src/features/metrics/server/jobs", () => ({
    aggregateDailyMetrics: vi.fn(),
    aggregateMonthlyMetrics: vi.fn(),
    updateUserMetrics: vi.fn(),
    retentionCleanup: vi.fn(),
}))

const refreshMock = vi.fn()
vi.mock("@/src/features/metrics/server/citations-service", async () => {
    const actual = await vi.importActual<typeof import("@/src/features/metrics/server/citations-service")>(
        "@/src/features/metrics/server/citations-service",
    )
    return { ...actual, refreshCitationCounts: (...a: unknown[]) => refreshMock(...a) }
})

import { metricsRouter } from "@/src/features/metrics/server/route"

const SECRET = "integration-test-cron-secret"
const app = new Hono().basePath("/api")
app.route("/metrics", metricsRouter)

let savedSecret: string | undefined
beforeEach(() => {
    vi.clearAllMocks()
    savedSecret = process.env.CRON_SECRET
    process.env.CRON_SECRET = SECRET
    acquireJobLockMock.mockResolvedValue(true)
})
afterEach(() => {
    if (savedSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = savedSecret
})

describe("GET /api/metrics/citations", () => {
    it("400 without doi/dois", async () => {
        const res = await app.request("/api/metrics/citations")
        expect(res.status).toBe(400)
        expect(findManyMock).not.toHaveBeenCalled()
    })
    it("400 when more than 50", async () => {
        const dois = Array.from({ length: 51 }, (_, i) => `10.26629/d${i}`).join(",")
        const res = await app.request(`/api/metrics/citations?dois=${dois}`)
        expect(res.status).toBe(400)
        expect(findManyMock).not.toHaveBeenCalled()
    })
    it("returns stored rows for valid DOIs", async () => {
        findManyMock.mockResolvedValue([{ doi: "10.26629/a", count: 4, source: "openalex", fetched_at: new Date("2026-02-01T00:00:00Z") }])
        const res = await app.request("/api/metrics/citations?doi=10.26629/A&dois=10.26629/b")
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toEqual({ success: true, data: [{ doi: "10.26629/a", count: 4, source: "openalex", fetched_at: "2026-02-01T00:00:00.000Z" }] })
        expect(findManyMock.mock.calls[0][0].where.doi.in).toEqual(["10.26629/a", "10.26629/b"])
    })
    it("ignores foreign DOIs", async () => {
        findManyMock.mockResolvedValue([])
        const res = await app.request("/api/metrics/citations?dois=10.1000/x,10.26629/ok")
        expect(res.status).toBe(200)
        expect(findManyMock.mock.calls[0][0].where.doi.in).toEqual(["10.26629/ok"])
        const only = await app.request("/api/metrics/citations?doi=10.1000/x")
        expect(await only.json()).toEqual({ success: true, data: [] })
    })
})

describe("POST /api/metrics/cron/citations", () => {
    const post = (token?: string) =>
        app.request("/api/metrics/cron/citations", {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

    it("401 without Bearer secret, refresh not called", async () => {
        expect((await post()).status).toBe(401)
        expect((await post("wrong")).status).toBe(401)
        expect(refreshMock).not.toHaveBeenCalled()
    })
    it("200 success when nothing remains", async () => {
        refreshMock.mockResolvedValue({ total: 3, checked: 3, updated: 3, failed: 0, remaining: 0 })
        const res = await post(SECRET)
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ success: true, total: 3, checked: 3, remaining: 0 })
        expect(acquireJobLockMock.mock.calls[0][0]).toBe("citations_refresh_lock")
        expect(refreshMock.mock.calls[0][0].deadline).toBeGreaterThan(Date.now())
    })
    it("207 partial when remaining > 0", async () => {
        refreshMock.mockResolvedValue({ total: 10, checked: 4, updated: 4, failed: 0, remaining: 6 })
        const res = await post(SECRET)
        expect(res.status).toBe(207)
        expect(await res.json()).toMatchObject({ success: false, remaining: 6 })
    })
    it("429 when lock held", async () => {
        acquireJobLockMock.mockResolvedValue(false)
        expect((await post(SECRET)).status).toBe(429)
        expect(refreshMock).not.toHaveBeenCalled()
    })
})
