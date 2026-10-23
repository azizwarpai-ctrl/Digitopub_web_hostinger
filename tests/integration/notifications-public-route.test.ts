import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

vi.mock("server-only", () => ({}))

// Admin auth is never consulted by the public router; the admin router behind
// it must still answer 401 to anonymous callers.
vi.mock("@/src/lib/db/auth", () => ({
    getSession: vi.fn(() => null),
    createSession: vi.fn(),
    destroySession: vi.fn(),
}))

// ── Captured lifecycle emails ───────────────────────────────────────────────
const sent: Array<{ templateName: string; to: string; variables: Record<string, string> }> = []
vi.mock("@/src/lib/email/service", () => ({
    sendTemplateEmail: vi.fn(async (opts: (typeof sent)[number]) => {
        sent.push(opts)
        return { success: true }
    }),
}))

// ── In-memory Prisma stand-in (only what the public flow touches) ───────────
type Row = Record<string, any> & { id: bigint }
let seq = 1n
const db = {
    journals: [] as Row[],
    disciplines: [] as Row[],
    subscribers: [] as Row[],
    sj: [] as Array<{ subscriber_id: bigint; journal_id: bigint }>,
    sd: [] as Array<{ subscriber_id: bigint; discipline_id: bigint }>,
}

function matches(row: Record<string, any>, where: Record<string, any> = {}): boolean {
    return Object.entries(where).every(([k, v]) => {
        if (k === "OR") return (v as any[]).some((w) => matches(row, w))
        if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k])
        if (v && typeof v === "object" && "lt" in v) return row[k] < v.lt
        return row[k] === v
    })
}

function apply(row: Row, data: Record<string, any>) {
    for (const [k, v] of Object.entries(data)) {
        row[k] = v && typeof v === "object" && "increment" in v ? row[k] + v.increment : v
    }
    row.updated_at = new Date()
    return row
}

const prismaMock: any = {
    journal: { findMany: vi.fn(async ({ where }: any) => db.journals.filter((j) => matches(j, where))) },
    discipline: { findMany: vi.fn(async ({ where }: any) => db.disciplines.filter((d) => matches(d, where))) },
    notificationSubscriber: {
        findUnique: vi.fn(async ({ where }: any) => db.subscribers.find((s) => matches(s, where)) ?? null),
        findFirst: vi.fn(async ({ where }: any) => db.subscribers.find((s) => matches(s, where)) ?? null),
        create: vi.fn(async ({ data }: any) => {
            const row = {
                id: seq++, token_version: 0, article_frequency: "weekly", issue_alerts: true, orcid: null,
                confirmed_at: null, unsubscribed_at: null, created_at: new Date(), updated_at: new Date(), ...data,
            }
            db.subscribers.push(row)
            return row
        }),
        update: vi.fn(async ({ where, data }: any) => apply(db.subscribers.find((s) => s.id === where.id)!, data)),
        updateMany: vi.fn(async ({ where, data }: any) => {
            const hits = db.subscribers.filter((s) => matches(s, where))
            hits.forEach((s) => apply(s, data))
            return { count: hits.length }
        }),
    },
    subscriberJournal: {
        deleteMany: vi.fn(async ({ where }: any) => {
            db.sj = db.sj.filter((r) => r.subscriber_id !== where.subscriber_id)
            return { count: 0 }
        }),
        createMany: vi.fn(async ({ data }: any) => { db.sj.push(...data); return { count: data.length } }),
        findMany: vi.fn(async ({ where, select }: any) => db.sj.filter((r) => matches(r, where)).map((r) =>
            select?.journal ? { journal: db.journals.find((j) => j.id === r.journal_id) } : r)),
    },
    subscriberDiscipline: {
        deleteMany: vi.fn(async ({ where }: any) => {
            db.sd = db.sd.filter((r) => r.subscriber_id !== where.subscriber_id)
            return { count: 0 }
        }),
        createMany: vi.fn(async ({ data }: any) => { db.sd.push(...data); return { count: data.length } }),
        findMany: vi.fn(async ({ where, select }: any) => db.sd.filter((r) => matches(r, where)).map((r) =>
            select?.discipline ? { discipline: db.disciplines.find((d) => d.id === r.discipline_id) } : r)),
    },
    emailTemplate: { upsert: vi.fn(async () => ({ id: 1n })) },
    systemSetting: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
}
// Getter: vi.mock is hoisted above prismaMock, so resolve it lazily.
vi.mock("@/src/lib/db/config", () => ({ get prisma() { return prismaMock } }))

process.env.NOTIFY_TOKEN_SECRET = "notify-test-secret"
process.env.EVENT_IP_HASH_SALT_SEED ||= "test-secret"
process.env.NEXT_PUBLIC_APP_URL = "https://digitopub.test"

import {
    notificationsPublicRouter,
    SUBSCRIBE_GENERIC_MESSAGE,
    __flushNotificationEmailsForTests,
} from "@/src/server/routes/notifications-public"
import { notificationsRouter } from "@/src/features/notifications/server"
import { signNotifyToken } from "@/src/lib/notification-token"
import { __resetRateLimiterForTests } from "@/src/lib/rate-limiter"

const app = new Hono()
    .route("/notifications", notificationsPublicRouter)
    .route("/notifications", notificationsRouter)

let ipCounter = 0
function post(path: string, body: unknown, opts: { form?: boolean; ip?: string } = {}) {
    const headers: Record<string, string> = { "x-forwarded-for": opts.ip ?? `10.0.0.${++ipCounter % 250}` }
    let payload: string
    if (opts.form) {
        headers["content-type"] = "application/x-www-form-urlencoded"
        payload = new URLSearchParams(body as Record<string, string>).toString()
    } else {
        headers["content-type"] = "application/json"
        payload = JSON.stringify(body)
    }
    return app.request(`http://test/notifications${path}`, { method: "POST", headers, body: payload })
}

const tokenFrom = (url: string) => new URL(url).searchParams.get("token")!

async function subscribe(email: string, extra: Record<string, unknown> = {}) {
    const res = await post("/subscribe", { email, journal_ids: ["100"], discipline_ids: ["200"], ...extra })
    await __flushNotificationEmailsForTests()
    return res
}

beforeEach(() => {
    __resetRateLimiterForTests()
    sent.length = 0
    seq = 1n
    db.journals = [{ id: 100n, title: "Journal of Orthodontic Research", status: "active" }]
    db.disciplines = [{ id: 200n, name: "Orthodontics", parent_id: null, is_active: true }]
    db.subscribers = []
    db.sj = []
    db.sd = []
})

describe("public subscribe", () => {
    it("answers generically and keeps one row for repeated sign-ups", async () => {
        const first = await subscribe("Reader@Example.org")
        const second = await subscribe("reader@example.org")

        expect(first.status).toBe(202)
        expect(second.status).toBe(202)
        expect(await first.json()).toEqual({ success: true, message: SUBSCRIBE_GENERIC_MESSAGE })
        expect(await second.json()).toEqual({ success: true, message: SUBSCRIBE_GENERIC_MESSAGE })
        expect(db.subscribers).toHaveLength(1)
        expect(db.subscribers[0]).toMatchObject({ email: "reader@example.org", status: "pending", source: "public_form" })
        expect(db.sj).toEqual([{ subscriber_id: db.subscribers[0].id, journal_id: 100n }])
        expect(sent.map((m) => m.templateName)).toEqual(["notify_subscription_confirm", "notify_subscription_confirm"])
    })

    it("ignores unknown or inactive journal and discipline ids", async () => {
        await subscribe("a@example.org", { journal_ids: ["100", "999"], discipline_ids: ["777"] })
        expect(db.sj.map((r) => r.journal_id)).toEqual([100n])
        expect(db.sd).toEqual([])
    })

    it("does nothing for bounced, complained or active addresses, but still answers generically", async () => {
        for (const status of ["bounced", "complained", "active"]) {
            db.subscribers.push({ id: seq++, email: `${status}@example.org`, status, token_version: 0 })
        }
        for (const status of ["bounced", "complained", "active"]) {
            const res = await subscribe(`${status}@example.org`)
            expect(res.status).toBe(202)
            expect(await res.json()).toEqual({ success: true, message: SUBSCRIBE_GENERIC_MESSAGE })
        }
        expect(sent).toHaveLength(0)
        expect(db.subscribers.map((s) => s.status)).toEqual(["bounced", "complained", "active"])
    })

    it("treats a filled honeypot as success without creating anything", async () => {
        const res = await subscribe("bot@example.org", { website: "http://spam" })
        expect(res.status).toBe(202)
        expect(db.subscribers).toHaveLength(0)
        expect(sent).toHaveLength(0)
    })

    it("rejects markup in names", async () => {
        const res = await post("/subscribe", { email: "x@example.org", name: "<b>Eve</b>" })
        expect(res.status).toBe(400)
    })

    it("silently stops re-sending after the per-address limit", async () => {
        for (let i = 0; i < 5; i++) await subscribe("busy@example.org")
        expect(sent).toHaveLength(3)
    })

    it("is not shadowed by the admin router, which still rejects anonymous callers", async () => {
        expect((await subscribe("ok@example.org")).status).toBe(202)
        const admin = await app.request("http://test/notifications/subscribers")
        expect(admin.status).toBe(401)
    })
})

describe("subscribe → confirm → manage → unsubscribe", () => {
    it("runs the full double opt-in lifecycle", async () => {
        await subscribe("reader@example.org")
        const confirmToken = tokenFrom(sent[0].variables.confirm_url)
        expect(sent[0].variables.confirm_url.startsWith("https://digitopub.test/notifications/confirm?token=")).toBe(true)

        // Confirm activates and sends the welcome email.
        const confirm = await post("/confirm", { token: confirmToken })
        await __flushNotificationEmailsForTests()
        expect(confirm.status).toBe(200)
        expect((await confirm.json()).data.status).toBe("confirmed")
        expect(db.subscribers[0]).toMatchObject({ status: "active", confirm_token_hash: null })
        expect(db.subscribers[0].confirmed_at).toBeInstanceOf(Date)
        const welcome = sent.find((m) => m.templateName === "notify_welcome")!
        expect(welcome.to).toBe("reader@example.org")

        // A second click is harmless.
        const again = await post("/confirm", { token: confirmToken })
        expect((await again.json()).data.status).toBe("already_active")

        // Preference centre via the manage link.
        const manageToken = tokenFrom(welcome.variables.manage_url)
        const lookup = await post("/preferences/lookup", { token: manageToken })
        expect(lookup.status).toBe(200)
        const prefs = (await lookup.json()).data
        expect(prefs.subscriber).toMatchObject({ email: "reader@example.org", status: "active", journal_ids: ["100"] })
        expect(prefs.options.journals).toEqual([{ id: "100", title: "Journal of Orthodontic Research", status: "active" }])

        const save = await post("/preferences", {
            token: manageToken, journal_ids: [], discipline_ids: ["200"], article_frequency: "daily", issue_alerts: false,
        })
        await __flushNotificationEmailsForTests()
        expect(save.status).toBe(200)
        expect(db.subscribers[0]).toMatchObject({ article_frequency: "daily", issue_alerts: false })
        expect(db.sj).toEqual([])
        expect(sent.some((m) => m.templateName === "notify_preferences_updated")).toBe(true)

        // RFC 8058 one-click: form-encoded body, token in the URL.
        const unsubToken = tokenFrom(welcome.variables.unsubscribe_url)
        const oneClick = await app.request(
            `http://test/notifications/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
            { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" },
        )
        expect(oneClick.status).toBe(200)
        expect(db.subscribers[0].status).toBe("unsubscribed")

        // Idempotent, and JSON works too.
        const json = await post("/unsubscribe", { token: unsubToken })
        expect(json.status).toBe(200)
        expect(db.subscribers[0].status).toBe("unsubscribed")
    })

    it("rejects tampered and expired confirm links", async () => {
        await subscribe("reader@example.org")
        const token = tokenFrom(sent[0].variables.confirm_url)
        const tampered = await post("/confirm", { token: `${token.slice(0, -3)}abc` })
        expect(tampered.status).toBe(400)

        const sid = db.subscribers[0].id
        const old = signNotifyToken({ purpose: "confirm", subscriberId: sid, version: 0, now: Math.floor(Date.now() / 1000) - 31 * 86400 })
        const expired = await post("/confirm", { token: old })
        expect(expired.status).toBe(410)
        expect(db.subscribers[0].status).toBe("pending")
    })

    it("accepts only the latest confirm link", async () => {
        await subscribe("reader@example.org")
        const firstToken = tokenFrom(sent[0].variables.confirm_url)
        // Same second → same token; force a different iat for the second request.
        vi.useFakeTimers({ now: Date.now() + 5000, toFake: ["Date"] })
        await subscribe("reader@example.org")
        vi.useRealTimers()
        const secondToken = tokenFrom(sent[1].variables.confirm_url)
        expect(secondToken).not.toBe(firstToken)

        expect((await post("/confirm", { token: firstToken })).status).toBe(400)
        expect((await post("/confirm", { token: secondToken })).status).toBe(200)
    })

    it("revokes old links when an unsubscribed address signs up again", async () => {
        db.subscribers.push({ id: 50n, email: "back@example.org", status: "unsubscribed", token_version: 0, name: null, orcid: null })
        const oldManage = signNotifyToken({ purpose: "manage", subscriberId: 50n, version: 0 })

        await subscribe("back@example.org")
        expect(db.subscribers[0]).toMatchObject({ status: "pending", token_version: 1 })
        expect((await post("/preferences/lookup", { token: oldManage })).status).toBe(400)
    })

    it("lets the owner resume after unsubscribing, but never revives a bounce", async () => {
        db.subscribers.push({ id: 60n, email: "u@example.org", status: "unsubscribed", token_version: 0, name: null })
        db.subscribers.push({ id: 61n, email: "b@example.org", status: "bounced", token_version: 0, name: null })
        const base = { journal_ids: [], discipline_ids: [], article_frequency: "weekly", issue_alerts: true, resume: true }

        const resumed = await post("/preferences", { ...base, token: signNotifyToken({ purpose: "manage", subscriberId: 60n, version: 0 }) })
        expect(resumed.status).toBe(200)
        expect(db.subscribers[0].status).toBe("active")

        const bounced = await post("/preferences", { ...base, token: signNotifyToken({ purpose: "manage", subscriberId: 61n, version: 0 }) })
        expect(bounced.status).toBe(409)
        expect(db.subscribers[1].status).toBe("bounced")
    })

    it("refuses unsubscribe with an invalid token and redirects humans to the page", async () => {
        expect((await post("/unsubscribe", { token: "x".repeat(40) })).status).toBe(400)
        const get = await app.request("http://test/notifications/unsubscribe?token=abc")
        expect(get.status).toBe(303)
        expect(get.headers.get("location")).toBe("/notifications/unsubscribe?token=abc")
    })
})

describe("re-requesting a confirmation link", () => {
    it("keeps the earlier follows when the new request selects nothing", async () => {
        await subscribe("reader@example.org")
        await subscribe("reader@example.org", { journal_ids: [], discipline_ids: [] })
        expect(db.sj).toEqual([{ subscriber_id: db.subscribers[0].id, journal_id: 100n }])
        expect(db.sd).toEqual([{ subscriber_id: db.subscribers[0].id, discipline_id: 200n }])
        expect(sent[1].variables.selected_journals).toBe("Journal of Orthodontic Research")
    })
})

describe("links from admin test emails (subscriber 0)", () => {
    const sample = (purpose: "confirm" | "manage" | "unsub") => signNotifyToken({ purpose, subscriberId: 0n, version: 0 })
    const writes = () =>
        [
            prismaMock.notificationSubscriber.update,
            prismaMock.notificationSubscriber.updateMany,
            prismaMock.notificationSubscriber.create,
            prismaMock.$transaction,
        ].reduce((n, fn) => n + fn.mock.calls.length, 0)

    beforeEach(() => vi.clearAllMocks())

    it("explains instead of failing, and changes nothing", async () => {
        const confirm = await post("/confirm", { token: sample("confirm") })
        expect(confirm.status).toBe(200)
        expect((await confirm.json()).data).toEqual({ status: "test" })

        const lookup = await post("/preferences/lookup", { token: sample("manage") })
        expect(lookup.status).toBe(200)
        expect((await lookup.json()).data).toEqual({ test: true })

        const save = await post("/preferences", {
            token: sample("manage"), journal_ids: [], discipline_ids: [], article_frequency: "weekly", issue_alerts: true,
        })
        expect(save.status).toBe(200)

        for (const token of [sample("unsub"), sample("manage")]) {
            const unsub = await post("/unsubscribe", { token })
            expect(unsub.status).toBe(200)
            expect((await unsub.json()).data).toEqual({ status: "test" })
        }
        // One-click (RFC 8058): token in the query, form body.
        const oneClick = await app.request(`http://test/notifications/unsubscribe?token=${encodeURIComponent(sample("unsub"))}`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.9.9" },
            body: "List-Unsubscribe=One-Click",
        })
        expect(oneClick.status).toBe(200)

        await __flushNotificationEmailsForTests()
        expect(writes()).toBe(0)
        expect(prismaMock.notificationSubscriber.findUnique).not.toHaveBeenCalled()
        expect(sent).toEqual([])
    })

    it("still rejects a forged subscriber-0 link", async () => {
        const forged = sample("confirm").replace(/.$/, (c) => (c === "A" ? "B" : "A"))
        expect((await post("/confirm", { token: forged })).status).toBe(400)
    })

    it("does not affect real confirm links", async () => {
        await subscribe("reader@example.org")
        const confirm = await post("/confirm", { token: tokenFrom(sent[0].variables.confirm_url) })
        expect((await confirm.json()).data.status).toBe("confirmed")
        expect(db.subscribers[0].status).toBe("active")
    })
})
