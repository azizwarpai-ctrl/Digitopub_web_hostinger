import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import { Prisma } from "@prisma/client"

vi.mock("server-only", () => ({}))

let mockSession: { id: string; email: string; role: string } | null = null
vi.mock("@/src/lib/db/auth", () => ({
    getSession: vi.fn(() => mockSession),
    createSession: vi.fn(),
    destroySession: vi.fn(),
}))
const sentMail: any[] = []
vi.mock("@/src/lib/email/notification-transport", () => ({
    getNotificationTransport: () => ({
        send: vi.fn(async (m: any) => {
            sentMail.push(m)
            return m.to.startsWith("bounce") ? { ok: false, permanent: true, error: "550 no such user" } : { ok: true }
        }),
    }),
    notificationFromAddress: () => '"DigitoPub" <noreply@digitopub.com>',
}))

type Row = Record<string, any> & { id: bigint }
let seq = 100n
const db = {
    subscribers: [] as Row[],
    follows: [] as Array<{ subscriber_id: bigint; journal_id: bigint }>,
    journals: [] as Row[],
    imports: [] as Row[],
    templates: [] as Row[],
    campaigns: [] as Row[],
    rules: [] as Row[],
}
const byId = (rows: Row[], id: bigint) => rows.find((r) => r.id === id) ?? null

/** The subset of Prisma's where clauses the custom-audience code uses. */
function subscriberMatches(s: Row, where: any = {}): boolean {
    if (where.status && s.status !== where.status) return false
    if (where.import_id !== undefined && s.import_id !== where.import_id) return false
    if (where.id?.in && !where.id.in.includes(s.id)) return false
    if (where.journals?.some) return db.follows.some((f) => f.subscriber_id === s.id && f.journal_id === where.journals.some.journal_id)
    return true
}

const prismaMock: any = {
    notificationSubscriber: {
        findMany: vi.fn(async ({ where, select }: any) => db.subscribers.filter((s) => subscriberMatches(s, where)).map((s) => select?.journals
            ? { ...s, journals: db.follows.filter((f) => f.subscriber_id === s.id).map((f) => ({ journal_id: f.journal_id })), disciplines: [] }
            : { id: s.id })),
    },
    journal: { findUnique: vi.fn(async ({ where }: any) => byId(db.journals, where.id)) },
    discipline: { findMany: vi.fn(async () => []) },
    publicationEvent: { findMany: vi.fn(async () => []) },
    subscriberImport: { findUnique: vi.fn(async ({ where }: any) => byId(db.imports, where.id)) },
    systemSetting: { findUnique: vi.fn(async () => null) },
    emailTemplate: {
        findUnique: vi.fn(async ({ where }: any) => (where.id ? byId(db.templates, where.id) : db.templates.find((t) => t.name === where.name) ?? null)),
        findUniqueOrThrow: vi.fn(async ({ where }: any) => byId(db.templates, where.id)!),
        upsert: vi.fn(async ({ where, create }: any) => {
            let t = db.templates.find((x) => x.name === where.name)
            if (!t) db.templates.push((t = { id: seq++, ...create }))
            return { id: t.id }
        }),
        create: vi.fn(async ({ data }: any) => {
            if (db.templates.some((t) => t.name === data.name)) {
                throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" })
            }
            const t = { id: seq++, ...data }
            db.templates.push(t)
            return { id: t.id, name: t.name }
        }),
        update: vi.fn(async ({ where, data }: any) => {
            const t = Object.assign(byId(db.templates, where.id)!, data)
            return { id: t.id, name: t.name }
        }),
    },
    notificationCampaign: {
        create: vi.fn(async ({ data }: any) => {
            const c = { id: seq++, html_override: null, text_override: null, ...data }
            db.campaigns.push(c)
            return c
        }),
        findUnique: vi.fn(async ({ where, include }: any) => {
            const c = byId(db.campaigns, where.id)
            if (!c) return null
            return include?.template ? { ...c, template: byId(db.templates, c.template_id) } : { ...c }
        }),
        update: vi.fn(async ({ where, data }: any) => Object.assign(byId(db.campaigns, where.id)!, data)),
        count: vi.fn(async ({ where }: any) => db.campaigns.filter((c) => c.template_id === where.template_id && c.status === where.status && c.id !== where.NOT?.id).length),
    },
    notificationRule: { count: vi.fn(async ({ where }: any) => db.rules.filter((r) => r.template_id === where.template_id).length) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
}
vi.mock("@/src/lib/db/config", () => ({ get prisma() { return prismaMock } }))

const { notificationsRouter } = await import("@/src/features/notifications/server")
const { saveDraftAsTemplate, overwriteDraftTemplate } = await import("@/src/features/notifications/server/custom-campaign-service")
const { TEMPLATE_SET } = await import("@/src/features/notifications/server/template-set")

const app = () => new Hono().route("/notifications", notificationsRouter)
const send = (method: string, path: string, json?: unknown) => app().request(`/notifications${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
})

beforeEach(() => {
    vi.clearAllMocks()
    sentMail.length = 0
    process.env.NOTIFY_TOKEN_SECRET = "test-secret-test-secret-test-secret-0123"
    seq = 100n
    mockSession = { id: "7", email: "admin@example.org", role: "admin" }
    db.journals = [{ id: 10n, title: "Journal of Orthodontic Research", status: "active" }, { id: 11n, title: "Closed", status: "inactive" }]
    db.subscribers = [
        { id: 1n, email: "a@x.org", status: "active", import_id: 50n },
        { id: 2n, email: "b@x.org", status: "active", import_id: null },
        { id: 3n, email: "c@x.org", status: "pending", import_id: 50n },
        { id: 4n, email: "d@x.org", status: "unsubscribed", import_id: 50n },
    ]
    db.follows = [{ subscriber_id: 1n, journal_id: 10n }, { subscriber_id: 3n, journal_id: 10n }, { subscriber_id: 4n, journal_id: 10n }]
    db.imports = [{ id: 50n, status: "confirmed", journal_id: 10n }, { id: 51n, status: "parsed", journal_id: null }]
    db.templates = []
    db.campaigns = []
    db.rules = []
})

describe("New message campaigns", () => {
    it("requires an admin", async () => {
        mockSession = null
        expect((await send("POST", "/campaigns", { audience: { kind: "all" }, subject: "Hi" })).status).toBe(401)
        mockSession = { id: "8", email: "u@x.org", role: "author" }
        expect((await send("POST", "/campaigns", { audience: { kind: "all" }, subject: "Hi" })).status).toBe(403)
    })

    it.each([
        [{ kind: "all" }, 2],
        [{ kind: "journal", journal_id: "10" }, 1],
        [{ kind: "people", subscriber_ids: ["2", "3", "4"] }, 1],
        [{ kind: "import", import_id: "50" }, 1],
    ])("reaches confirmed subscribers only: %j", async (audience, expected) => {
        const res = await send("POST", "/campaigns", { audience, subject: "Call for papers", message_heading: "Special issue", message: "Dear all" })
        expect(res.status).toBe(201)
        const c = db.campaigns[0]
        expect(c).toMatchObject({ type: "custom", status: "draft", subject_override: "Call for papers", recipient_estimate: expected })
        expect(c.payload).toMatchObject({ audience, message_heading: "Special issue", message: "Dear all" })
        // The general-purpose letter is installed on first use.
        expect(db.templates.find((t) => t.id === c.template_id)?.name).toBe("notify_custom_message")
    })

    it("links journal and journal-list audiences to the journal (its sender name)", async () => {
        await send("POST", "/campaigns", { audience: { kind: "journal", journal_id: "10" }, subject: "S" })
        await send("POST", "/campaigns", { audience: { kind: "import", import_id: "50" }, subject: "S" })
        await send("POST", "/campaigns", { audience: { kind: "all" }, subject: "S" })
        expect(db.campaigns.map((c) => c.payload.journal_id ?? null)).toEqual(["10", "10", null])
    })

    it("refuses bad audiences and templates", async () => {
        expect((await send("POST", "/campaigns", { audience: { kind: "journal", journal_id: "11" }, subject: "S" })).status).toBe(400)
        expect((await send("POST", "/campaigns", { audience: { kind: "import", import_id: "51" }, subject: "S" })).status).toBe(400)
        expect((await send("POST", "/campaigns", { audience: { kind: "people", subscriber_ids: [] }, subject: "S" })).status).toBe(400)
        expect((await send("POST", "/campaigns", { audience: { kind: "all" }, subject: "" })).status).toBe(400)
        db.templates.push({ id: 9n, name: "otp", category: "transactional" })
        expect((await send("POST", "/campaigns", { audience: { kind: "all" }, subject: "S", template_id: "9" })).status).toBe(400)
        expect(db.campaigns).toHaveLength(0)
    })
})

describe("editing content and templates", () => {
    const shipped = TEMPLATE_SET.notify_custom_message
    async function draft() {
        db.templates.push({ id: 20n, name: "notify_custom_message", category: "notification", ...shipped })
        db.campaigns.push({ id: 30n, type: "custom", status: "draft", template_id: 20n, subject_override: "Call for papers", html_override: null, text_override: null, payload: { audience: { kind: "all" } } })
        return 30n
    }

    it("keeps the unsubscribe link, manage link and postal address in edited content", async () => {
        const id = await draft()
        const bad = await send("PATCH", `/campaigns/${id}`, { html_override: "<p>Hello {{recipient_name}}</p>" })
        expect(bad.status).toBe(400)
        expect((await bad.json()).error).toMatch(/unsubscribe link/)
        expect((await send("PATCH", `/campaigns/${id}`, { html_override: shipped.html_content.replace("{{{message_html}}}", "{{{recipient_name}}}") })).status).toBe(400)
        expect((await send("PATCH", `/campaigns/${id}`, { text_override: "No footer here" })).status).toBe(400)

        const edited = shipped.html_content.replace("Dear {{recipient_name}},", "Dear colleague,")
        expect((await send("PATCH", `/campaigns/${id}`, { html_override: edited })).status).toBe(200)
        expect(byId(db.campaigns, id)!.html_override).toBe(edited)
        // null restores the template's content.
        expect((await send("PATCH", `/campaigns/${id}`, { html_override: null })).status).toBe(200)
        expect(byId(db.campaigns, id)!.html_override).toBeNull()
    })

    it("saves a draft as a new template and points the draft at it", async () => {
        const id = await draft()
        byId(db.campaigns, id)!.html_override = shipped.html_content.replace("Dear {{recipient_name}},", "Dear colleague,")
        const t = (await saveDraftAsTemplate(id, { name: "call_for_papers" }))!
        const saved = db.templates.find((x) => x.name === "call_for_papers")!
        expect(saved).toMatchObject({ category: "notification", subject: "Call for papers" })
        expect(saved.html_content).toContain("Dear colleague,")
        expect(saved.variables).toContain("unsubscribe_url")
        expect(byId(db.campaigns, id)).toMatchObject({ template_id: t.id, subject_override: null, html_override: null, text_override: null })
        // The shipped template is untouched.
        expect(db.templates.find((x) => x.name === "notify_custom_message")!.html_content).toBe(shipped.html_content)
        await expect(saveDraftAsTemplate(id, { name: "call_for_papers" })).rejects.toThrow(/already exists/)
    })

    it("overwrites the draft's template with its edits", async () => {
        const id = await draft()
        byId(db.campaigns, id)!.html_override = shipped.html_content.replace("Dear {{recipient_name}},", "Dear colleague,")
        await overwriteDraftTemplate(id)
        const t = byId(db.templates, 20n)!
        expect(t.subject).toBe("Call for papers")
        expect(t.html_content).toContain("Dear colleague,")
        expect(byId(db.campaigns, id)).toMatchObject({ subject_override: null, html_override: null })
    })

    it("only changes drafts, over the routes too", async () => {
        const id = await draft()
        byId(db.campaigns, id)!.status = "queued"
        expect((await send("POST", `/campaigns/${id}/overwrite-template`)).status).toBe(409)
        expect((await send("POST", `/campaigns/${id}/save-as-template`, { name: "x_y" })).status).toBe(409)
        expect((await send("POST", `/campaigns/${id}/save-as-template`, { name: "Bad Name" })).status).toBe(400)
        expect((await send("POST", "/campaigns/999/overwrite-template")).status).toBe(404)
    })
})

describe("test sends to several addresses", () => {
    async function customDraft() {
        await send("POST", "/campaigns", { audience: { kind: "journal", journal_id: "10" }, subject: "Call for papers", message: "Hello" })
        return db.campaigns[0].id
    }

    it("sends the [TEST] message to each address under the journal's name, reporting failures", async () => {
        const id = await customDraft()
        const res = await send("POST", `/campaigns/${id}/test`, { recipients: ["Editor@x.org", "bounce@x.org", "editor@x.org", "chief@x.org"] })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toEqual({ sent: ["editor@x.org", "chief@x.org"], failed: [{ to: "bounce@x.org", error: "550 no such user" }] })
        expect(body.message).toBe("Test sent to 2 of 3 addresses")
        expect(sentMail.map((m) => m.to)).toEqual(["editor@x.org", "bounce@x.org", "chief@x.org"])
        expect(sentMail.every((m) => m.subject === "[TEST] Call for papers")).toBe(true)
        expect(sentMail.every((m) => m.fromName === "Journal of Orthodontic Research")).toBe(true)
    })

    it("defaults to the admin's own address and refuses more than 10", async () => {
        const id = await customDraft()
        expect((await send("POST", `/campaigns/${id}/test`, {})).status).toBe(200)
        expect(sentMail.map((m) => m.to)).toEqual(["admin@example.org"])
        const eleven = Array.from({ length: 11 }, (_, i) => `t${i}@x.org`)
        expect((await send("POST", `/campaigns/${id}/test`, { recipients: eleven })).status).toBe(400)
        expect((await send("POST", `/campaigns/${id}/test`, { recipients: ["not-an-email"] })).status).toBe(400)
    })

    it("returns 502 when every address fails", async () => {
        const id = await customDraft()
        const res = await send("POST", `/campaigns/${id}/test`, { recipients: ["bounce1@x.org", "bounce2@x.org"] })
        expect(res.status).toBe(502)
        expect((await res.json()).error).toBe("Test sent to 0 of 2 addresses")
    })
})
