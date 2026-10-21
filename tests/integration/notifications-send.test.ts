import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// ── In-memory Prisma stand-in for the send loop ─────────────────────────────
type Row = Record<string, any> & { id: bigint }
const db = {
    campaigns: [] as Row[],
    deliveries: [] as Row[],
    subscribers: [] as Row[],
    events: [] as Row[],
}

function matches(row: Record<string, any>, where: Record<string, any> = {}): boolean {
    return Object.entries(where).every(([k, v]) => {
        if (k === "campaign") return matches(db.campaigns.find((c) => c.id === row.campaign_id)!, v)
        if (v && typeof v === "object" && !(v instanceof Date) && typeof v !== "bigint") {
            if ("in" in v) return v.in.includes(row[k])
            if ("notIn" in v) return !v.notIn.includes(row[k])
            if ("gt" in v) return row[k] !== null && row[k] > v.gt
            if ("lte" in v) return row[k] !== null && row[k] <= v.lte
        }
        return row[k] === v
    })
}
function apply(row: Row, data: Record<string, any>) {
    for (const [k, v] of Object.entries(data)) {
        row[k] = v && typeof v === "object" && "increment" in v ? row[k] + v.increment : v
    }
    return row
}
const table = (rows: () => Row[]) => ({
    findUnique: vi.fn(async ({ where }: any) => rows().find((r) => r.id === where.id) ?? null),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => rows().find((r) => r.id === where.id)!),
    // Copies, like Prisma: later updates must not leak into rows already read.
    findMany: vi.fn(async ({ where, take }: any = {}) => rows().filter((r) => matches(r, where)).slice(0, take ?? Infinity).map((r) => ({ ...r }))),
    count: vi.fn(async ({ where }: any) => rows().filter((r) => matches(r, where)).length),
    update: vi.fn(async ({ where, data }: any) => apply(rows().find((r) => r.id === where.id)!, data)),
    updateMany: vi.fn(async ({ where, data }: any) => {
        const hits = rows().filter((r) => matches(r, where))
        hits.forEach((r) => apply(r, data))
        return { count: hits.length }
    }),
})

const template = {
    id: 1n, subject: "{{journal_title}} · Vol. {{volume}}", html_content: "<p>{{recipient_name}}</p>{{{toc_html}}}",
    text_content: "Hi {{recipient_name}}\n{{toc_text}}", variables: [],
}
const prismaMock: any = {
    notificationCampaign: table(() => db.campaigns),
    notificationDelivery: {
        ...table(() => db.deliveries),
        groupBy: vi.fn(async ({ where }: any) => {
            const counts = new Map<string, number>()
            for (const d of db.deliveries.filter((r) => matches(r, where))) counts.set(d.status, (counts.get(d.status) ?? 0) + 1)
            return [...counts].map(([status, n]) => ({ status, _count: { _all: n } }))
        }),
    },
    notificationSubscriber: {
        ...table(() => db.subscribers),
        findUnique: vi.fn(async ({ where }: any) => {
            const s = db.subscribers.find((r) => r.id === where.id)
            return s ? { ...s, journals: [{ journal_id: 10n }], disciplines: [] } : null
        }),
    },
    notificationRule: { findMany: vi.fn(async () => []) },
    emailTemplate: { findUniqueOrThrow: vi.fn(async () => template) },
    publicationEvent: { findMany: vi.fn(async ({ where }: any) => db.events.filter((e) => where.id.in.includes(e.id))) },
    discipline: { findMany: vi.fn(async () => []) },
}
vi.mock("@/src/lib/db/config", () => ({ get prisma() { return prismaMock } }))

process.env.NOTIFY_TOKEN_SECRET = "notify-test-secret"
process.env.NEXT_PUBLIC_APP_URL = "https://digitopub.test"

import { runSendBatch, pauseCampaign, resumeCampaign, cancelCampaign, campaignProgress } from "@/src/features/notifications/server/send-service"
import type { NotificationMessage, NotificationTransport, SendOutcome } from "@/src/lib/email/notification-transport"

class FakeTransport implements NotificationTransport {
    sent: NotificationMessage[] = []
    script = new Map<string, SendOutcome>()
    async send(m: NotificationMessage): Promise<SendOutcome> {
        const o = this.script.get(m.to)
        if (o && !o.ok) return o
        this.sent.push(m)
        return { ok: true }
    }
}

const NOW = new Date("2026-10-21T10:00:00Z")
const limits = { perRun: 10, perHour: 1000, perDay: 1000 }

function seed(n: number) {
    db.campaigns = [{ id: 1n, type: "issue", status: "queued", template_id: 1n, subject_override: null, payload: { event_ids: ["50"] }, sent_count: 0, failed_count: 0, created_at: NOW }]
    db.events = [{
        id: 50n, kind: "issue", discipline_ids: [], published_at: NOW,
        snapshot: {
            title: "Autumn", volume: 3, number: "2", year: 2026, cover_url: null, journal_title: "J <Ortho>", journal_issn: null,
            journal_id: "10", url: "https://digitopub.test/journals/7/issues/3/2",
            articles: [{ title: "A & B", authors: [{ name: "Ada" }], doi: null, section: "Research", is_open_access: false, url: "https://digitopub.test/a" }],
        },
    }]
    db.subscribers = Array.from({ length: n }, (_, i) => ({
        id: BigInt(100 + i), email: `r${i}@example.org`, name: `R${i}`, status: "active", token_version: 0,
        issue_alerts: true, article_frequency: "weekly", last_sent_at: null,
    }))
    db.deliveries = db.subscribers.map((s, i) => ({
        id: BigInt(1000 + i), campaign_id: 1n, subscriber_id: s.id, status: "queued", attempts: 0, last_error: null, sent_at: null, updated_at: NOW,
    }))
}

beforeEach(() => seed(25))

describe("runSendBatch", () => {
    it("drains 25 deliveries over 3 runs of 10 and then marks the campaign sent", async () => {
        const t = new FakeTransport()
        const r1 = await runSendBatch(t, { now: NOW, limits })
        const r2 = await runSendBatch(t, { now: NOW, limits })
        const r3 = await runSendBatch(t, { now: NOW, limits })
        expect([r1.sent, r2.sent, r3.sent]).toEqual([10, 10, 5])
        expect([r1.remaining, r2.remaining, r3.remaining]).toEqual([15, 5, 0])
        expect(r3.completed_campaigns).toEqual(["1"])
        expect(db.campaigns[0]).toMatchObject({ status: "sent", sent_count: 25 })
        expect(new Set(t.sent.map((m) => m.to)).size).toBe(25)
    })

    it("never exceeds the hourly cap counted from recent sends", async () => {
        db.deliveries[0].status = "sent"
        db.deliveries[0].sent_at = new Date(NOW.getTime() - 10 * 60 * 1000)
        const r = await runSendBatch(new FakeTransport(), { now: NOW, limits: { perRun: 10, perHour: 4, perDay: 100 } })
        expect(r.budget).toBe(3)
        expect(r.sent).toBe(3)
    })

    it("renders escaped HTML, a text part and RFC 8058 headers", async () => {
        seed(1)
        const t = new FakeTransport()
        await runSendBatch(t, { now: NOW, limits })
        const m = t.sent[0]
        expect(m.subject).toBe("J <Ortho> · Vol. 3")
        expect(m.html).toContain("A &amp; B")
        expect(m.html).not.toContain("{{")
        expect(m.text).toContain("A & B")
        expect(m.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/digitopub\.test\/api\/notifications\/unsubscribe\?token=[^>]+>$/)
        expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
        expect(m.headers.Precedence).toBe("bulk")
    })

    it("suppresses a hard bounce and retries a soft failure up to 3 attempts", async () => {
        seed(2)
        const t = new FakeTransport()
        t.script.set("r0@example.org", { ok: false, permanent: true, error: "550 no such user" })
        t.script.set("r1@example.org", { ok: false, permanent: false, error: "421 try later" })

        const r = await runSendBatch(t, { now: NOW, limits })
        expect(r).toMatchObject({ failed: 1, retried: 1, sent: 0 })
        expect(db.subscribers[0].status).toBe("bounced")
        expect(db.deliveries[1]).toMatchObject({ status: "queued", attempts: 1 })

        // Still in backoff a minute later.
        expect((await runSendBatch(t, { now: new Date(NOW.getTime() + 60_000), limits })).retried).toBe(0)
        // Attempts 2 and 3 after their backoff; the third failure is final.
        db.deliveries[1].updated_at = NOW
        await runSendBatch(t, { now: new Date(NOW.getTime() + 11 * 60_000), limits })
        await runSendBatch(t, { now: new Date(NOW.getTime() + 40 * 60_000), limits })
        expect(db.deliveries[1]).toMatchObject({ status: "failed", attempts: 3 })
        expect(db.subscribers[1].status).toBe("active")
        expect(db.campaigns[0].failed_count).toBe(2)
    })

    it("skips a subscriber who unsubscribed after the campaign was queued", async () => {
        seed(2)
        db.subscribers[0].status = "unsubscribed"
        const t = new FakeTransport()
        const r = await runSendBatch(t, { now: NOW, limits })
        expect(r).toMatchObject({ sent: 1, skipped: 1 })
        expect(db.deliveries[0].status).toBe("skipped")
        expect(t.sent.map((m) => m.to)).toEqual(["r1@example.org"])
    })

    it("promotes due scheduled campaigns", async () => {
        db.campaigns[0].status = "scheduled"
        db.campaigns[0].scheduled_at = new Date(NOW.getTime() - 1000)
        const r = await runSendBatch(new FakeTransport(), { now: NOW, limits })
        expect(r.promoted).toBe(1)
        expect(r.sent).toBe(10)
    })
})

describe("campaign controls", () => {
    it("pauses, resumes and cancels with queued rows skipped", async () => {
        expect(await pauseCampaign(1n)).toEqual({ ok: true, status: "paused" })
        expect((await runSendBatch(new FakeTransport(), { now: NOW, limits })).sent).toBe(0)
        expect(await resumeCampaign(1n)).toEqual({ ok: true, status: "queued" })
        await runSendBatch(new FakeTransport(), { now: NOW, limits })

        const progress = await campaignProgress(1n, { perRun: 10, perHour: 60, perDay: 1440 })
        expect(progress).toMatchObject({ sent: 10, queued: 15, remaining: 15, eta_minutes: 15 })

        expect(await cancelCampaign(1n)).toEqual({ ok: true, status: "cancelled" })
        expect(db.deliveries.filter((d) => d.status === "skipped")).toHaveLength(15)
        expect((await cancelCampaign(1n)).ok).toBe(false)
        expect((await resumeCampaign(1n)).ok).toBe(false)
    })
})
