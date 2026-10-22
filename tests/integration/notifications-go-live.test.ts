import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Hono } from "hono"

vi.mock("server-only", () => ({}))

let mockSession: { id: string; email: string; role: string } | null = null
vi.mock("@/src/lib/db/auth", () => ({
    getSession: vi.fn(() => mockSession),
    createSession: vi.fn(),
    destroySession: vi.fn(),
}))

const sent: any[] = []
let smtpConfigured = true
vi.mock("@/src/lib/email/notification-transport", () => ({
    getNotificationTransport: () => ({ send: vi.fn(async (m: any) => { sent.push(m); return { ok: true } }) }),
    isNotificationSmtpConfigured: () => smtpConfigured,
    notificationFromAddress: () => '"DigitoPub Alerts" <alerts@example.org>',
}))

type Row = Record<string, any>
const db = {
    disciplines: new Map<string, Row>(),
    rules: new Map<string, Row>(),
    templates: new Map<string, Row>(),
    runs: [] as Array<{ job_name: string; started_at: Date; status: string }>,
    settings: null as Record<string, unknown> | null,
}
let seq = 1n

const prismaMock: any = {
    discipline: {
        upsert: vi.fn(async ({ where, create }: any) => {
            if (!db.disciplines.has(where.slug)) db.disciplines.set(where.slug, { id: seq++, ...create })
            return db.disciplines.get(where.slug)
        }),
        count: vi.fn(async () => db.disciplines.size),
    },
    notificationRule: {
        upsert: vi.fn(async ({ where, create }: any) => {
            const key = `${where.scope_key_event_type.scope_key}|${where.scope_key_event_type.event_type}`
            if (!db.rules.has(key)) db.rules.set(key, { id: seq++, ...create })
            return db.rules.get(key)
        }),
    },
    emailTemplate: {
        findUnique: vi.fn(async ({ where }: any) => db.templates.get(where.name) ?? null),
        create: vi.fn(async ({ data }: any) => { db.templates.set(data.name, { id: seq++, ...data }); return data }),
        update: vi.fn(async ({ where, data }: any) => Object.assign(db.templates.get(where.name)!, data)),
        count: vi.fn(async ({ where }: any) => where.name.in.filter((n: string) => db.templates.has(n)).length),
    },
    syncRun: {
        findFirst: vi.fn(async ({ where }: any) => db.runs
            .filter((r) => r.job_name === where.job_name)
            .sort((a, b) => b.started_at.getTime() - a.started_at.getTime())[0] ?? null),
    },
    systemSetting: {
        findUnique: vi.fn(async () => (db.settings ? { setting_value: db.settings } : null)),
    },
}
vi.mock("@/src/lib/db/config", () => ({ get prisma() { return prismaMock } }))

const { notificationsRouter } = await import("@/src/features/notifications/server")
const { getReadiness, takeDeliverabilityTestSlot } = await import("@/src/features/notifications/server/go-live-service")

const app = () => new Hono().route("/notifications", notificationsRouter)
const post = (path: string, json?: unknown) => app().request(`/notifications/settings${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
})

const ENV_KEYS = ["NOTIFY_TOKEN_SECRET", "CRON_SECRET", "NEXT_PUBLIC_APP_URL", "NOTIFICATIONS_ENABLED"] as const
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
    vi.clearAllMocks()
    mockSession = { id: "7", email: "admin@example.org", role: "admin" }
    db.disciplines.clear()
    db.rules.clear()
    db.templates.clear()
    db.runs = []
    db.settings = null
    sent.length = 0
    smtpConfigured = true
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
})

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (savedEnv[k] === undefined) delete process.env[k]
        else process.env[k] = savedEnv[k]
    }
})

describe("go-live routes: auth", () => {
    it("rejects anonymous and non-admin callers", async () => {
        mockSession = null
        expect((await post("/install-defaults")).status).toBe(401)
        mockSession = { id: "8", email: "u@example.org", role: "author" }
        expect((await app().request("/notifications/settings/readiness")).status).toBe(403)
    })
})

describe("install starter data", () => {
    it("seeds disciplines, global rules and all seven templates, and is safe to repeat", async () => {
        const first = await (await post("/install-defaults")).json()
        expect(first.success).toBe(true)
        expect(first.data.disciplines).toBeGreaterThan(0)
        expect(first.data.rules).toBe(2)
        expect(first.data.templatesCreated).toBe(7)

        db.templates.get("notify_new_issue")!.subject = "edited by an admin"
        const again = await (await post("/install-defaults")).json()
        expect(again.data.templatesCreated).toBe(0)
        expect(again.data.templatesKept).toBe(7)
        expect(db.templates.get("notify_new_issue")!.subject).toBe("edited by an admin")
        expect(db.rules.size).toBe(2)
    })
})

describe("deliverability test", () => {
    it("sends a rendered alert with the one-click unsubscribe headers while the kill switch is off", async () => {
        process.env.NOTIFICATIONS_ENABLED = "false"
        db.settings = { publisher_address: "DigitoPub, 5 Real Road, Tripoli" }
        const res = await post("/deliverability-test", { to: "test-abc@srv1.mail-tester.com" })
        expect(res.status).toBe(200)
        expect(sent).toHaveLength(1)
        const m = sent[0]
        expect(m.to).toBe("test-abc@srv1.mail-tester.com")
        expect(m.subject).toContain("Journal of Orthodontic Research")
        expect(m.html).not.toMatch(/\{\{/)
        expect(m.text).not.toMatch(/\{\{/)
        expect(m.html).toContain("5 Real Road")
        expect(m.headers["List-Unsubscribe"]).toMatch(/^<https?:\/\/.+\/notifications\/unsubscribe\?token=/)
        expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
        expect(m.headers.Precedence).toBe("bulk")
    })

    it("rejects an invalid address", async () => {
        expect((await post("/deliverability-test", { to: "not-an-email" })).status).toBe(400)
        expect(sent).toHaveLength(0)
    })

    it("allows at most 10 tests per hour", () => {
        const t0 = Date.UTC(2030, 0, 1)
        for (let i = 0; i < 10; i++) expect(takeDeliverabilityTestSlot(t0 + i)).toBe(true)
        expect(takeDeliverabilityTestSlot(t0 + 11)).toBe(false)
        expect(takeDeliverabilityTestSlot(t0 + 61 * 60 * 1000)).toBe(true)
    })
})

describe("readiness", () => {
    const byKey = (items: Awaited<ReturnType<typeof getReadiness>>) => Object.fromEntries(items.map((i) => [i.key, i]))

    it("reports missing setup without exposing secret values", async () => {
        delete process.env.NOTIFY_TOKEN_SECRET
        process.env.CRON_SECRET = "super-secret-cron-value"
        process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
        delete process.env.NOTIFICATIONS_ENABLED
        smtpConfigured = false
        const items = byKey(await getReadiness())
        expect(items.token_secret.ok).toBe(false)
        expect(items.cron_secret.ok).toBe(true)
        expect(items.app_url.ok).toBe(false)
        expect(items.smtp.ok).toBe(false)
        expect(items.publisher_address.ok).toBe(false)
        expect(items.disciplines.ok).toBe(false)
        expect(items.templates.ok).toBe(false)
        expect(items.notifications_detect.ok).toBe(false)
        expect(items.enabled.ok).toBe(false)
        expect(JSON.stringify(items)).not.toContain("super-secret-cron-value")
    })

    it("turns green once everything is configured and the crons have run recently", async () => {
        process.env.NOTIFY_TOKEN_SECRET = "x"
        process.env.CRON_SECRET = "y"
        process.env.NEXT_PUBLIC_APP_URL = "https://digitopub.com"
        process.env.NOTIFICATIONS_ENABLED = "true"
        db.settings = { publisher_address: "DigitoPub, 5 Real Road, Tripoli" }
        await post("/install-defaults")
        const now = new Date("2030-01-01T12:00:00Z")
        const ago = (min: number) => new Date(now.getTime() - min * 60 * 1000)
        db.runs = [
            { job_name: "notifications_detect", started_at: ago(20), status: "success" },
            { job_name: "notifications_digests", started_at: ago(5 * 60), status: "success" },
            { job_name: "notifications_send", started_at: ago(3), status: "success" },
        ]
        const items = await getReadiness(now)
        expect(items.filter((i) => !i.ok)).toEqual([])
    })

    it("flags an overdue or failed cron", async () => {
        const now = new Date("2030-01-01T12:00:00Z")
        db.runs = [
            { job_name: "notifications_send", started_at: new Date(now.getTime() - 2 * 60 * 60 * 1000), status: "success" },
            { job_name: "notifications_detect", started_at: new Date(now.getTime() - 60 * 1000), status: "failed" },
        ]
        const items = byKey(await getReadiness(now))
        expect(items.notifications_send.ok).toBe(false)
        expect(items.notifications_send.detail).toContain("overdue")
        expect(items.notifications_detect.ok).toBe(false)
    })
})
