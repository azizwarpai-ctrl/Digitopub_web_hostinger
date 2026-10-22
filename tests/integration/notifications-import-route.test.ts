import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

// The admin router reaches the email service through the campaign controls (#201).
vi.mock("server-only", () => ({}))

// ── Mock session ────────────────────────────────────────────────────────────
let mockSession: { id: string; email: string; role: string } | null = null
vi.mock("@/src/lib/db/auth", () => ({
    getSession: vi.fn(() => mockSession),
    createSession: vi.fn(),
    destroySession: vi.fn(),
}))

// ── In-memory Prisma stand-in (only what the import flow touches) ───────────
type Row = Record<string, any> & { id: bigint }
let seq = 1n
const db = {
    disciplines: [] as Row[],
    subscribers: [] as Row[],
    imports: [] as Row[],
    importRows: [] as Row[],
    links: [] as Array<{ subscriber_id: bigint; discipline_id: bigint }>,
    follows: [] as Array<{ subscriber_id: bigint; journal_id: bigint }>,
    journals: [] as Row[],
    templates: [] as Row[],
    campaigns: [] as Row[],
}

function matches(row: Row, where: Record<string, any> = {}): boolean {
    return Object.entries(where).every(([k, v]) => {
        if (k === "NOT") return !matches(row, v)
        if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k])
        if (v && typeof v === "object" && "equals" in v) return JSON.stringify(row[k]) === JSON.stringify(v.equals)
        return row[k] === v
    })
}
const byId = (rows: Row[], id: bigint) => rows.find((r) => r.id === id) ?? null

const prismaMock = {
    discipline: {
        findMany: vi.fn(async ({ where }: any = {}) => db.disciplines.filter((d) => matches(d, where))),
        update: vi.fn(async ({ where, data }: any) => Object.assign(byId(db.disciplines, where.id)!, data)),
    },
    notificationSubscriber: {
        findMany: vi.fn(async ({ where }: any) => db.subscribers.filter((s) => matches(s, where))),
        createMany: vi.fn(async ({ data }: any) => {
            let count = 0
            for (const d of data) {
                if (db.subscribers.some((s) => s.email === d.email)) continue
                db.subscribers.push({ id: seq++, ...d })
                count++
            }
            return { count }
        }),
    },
    subscriberImport: {
        create: vi.fn(async ({ data }: any) => {
            const row = { id: seq++, created_at: new Date(), ...data }
            db.imports.push(row)
            return row
        }),
        findUnique: vi.fn(async ({ where }: any) => byId(db.imports, where.id)),
        findUniqueOrThrow: vi.fn(async ({ where }: any) => byId(db.imports, where.id)!),
        update: vi.fn(async ({ where, data }: any) => Object.assign(byId(db.imports, where.id)!, data)),
        updateMany: vi.fn(async ({ where, data }: any) => {
            const hits = db.imports.filter((i) => matches(i, where))
            hits.forEach((i) => Object.assign(i, data))
            return { count: hits.length }
        }),
    },
    subscriberImportRow: {
        createMany: vi.fn(async ({ data }: any) => {
            for (const d of data) db.importRows.push({ id: seq++, ...d })
            return { count: data.length }
        }),
        findMany: vi.fn(async ({ where, skip = 0, take }: any) =>
            db.importRows.filter((r) => matches(r, where)).slice(skip, take ? skip + take : undefined)),
        count: vi.fn(async ({ where }: any) => db.importRows.filter((r) => matches(r, where)).length),
        update: vi.fn(async ({ where, data }: any) => Object.assign(byId(db.importRows, where.id)!, data)),
        deleteMany: vi.fn(async ({ where }: any) => {
            const before = db.importRows.length
            db.importRows = db.importRows.filter((r) => !matches(r, where))
            return { count: before - db.importRows.length }
        }),
    },
    journal: { findUnique: vi.fn(async ({ where }: any) => byId(db.journals, where.id)) },
    subscriberJournal: {
        createMany: vi.fn(async ({ data }: any) => {
            db.follows.push(...data)
            return { count: data.length }
        }),
    },
    subscriberDiscipline: {
        createMany: vi.fn(async ({ data }: any) => {
            db.links.push(...data)
            return { count: data.length }
        }),
    },
    emailTemplate: {
        upsert: vi.fn(async ({ where, create }: any) => {
            let t = db.templates.find((x) => x.name === where.name)
            if (!t) db.templates.push((t = { id: seq++, ...create }))
            return { id: t.id }
        }),
    },
    notificationCampaign: {
        create: vi.fn(async ({ data }: any) => {
            const row = { id: seq++, ...data }
            db.campaigns.push(row)
            return row
        }),
    },
}
vi.mock("@/src/lib/db/config", () => ({ prisma: prismaMock }))

const { notificationsRouter } = await import("@/src/features/notifications/server")

const app = () => new Hono().route("/notifications", notificationsRouter)

function upload(path: string, name: string, content: string, extra: Record<string, string> = {}) {
    const fd = new FormData()
    fd.set("file", new Blob([content], { type: "text/csv" }), name)
    for (const [k, v] of Object.entries(extra)) fd.set(k, v)
    return app().request(`/notifications${path}`, { method: "POST", body: fd })
}

const CSV = [
    "Name,Email,Research interests",
    "Amal Ali,amal@example.org,Orthodontics; forensic odontology",
    "Omar,not-an-email,Endodontics",
    "Amal again,AMAL@example.org,",
    "Old Friend,old@example.org,Endodontics",
    "Bounced,gone@example.org,Endodontics",
    "Sara,sara@example.org,Forensic Odontology",
].join("\n")

beforeEach(() => {
    vi.clearAllMocks()
    mockSession = { id: "7", email: "admin@example.org", role: "admin" }
    seq = 100n
    db.disciplines = [
        { id: 1n, name: "Orthodontics", synonyms: ["clear aligners"], is_active: true },
        { id: 2n, name: "Endodontics", synonyms: [], is_active: true },
        { id: 3n, name: "Forensic Dentistry", synonyms: [], is_active: true },
    ]
    db.subscribers = [
        { id: 1n, email: "old@example.org", status: "active" },
        { id: 2n, email: "gone@example.org", status: "bounced" },
    ]
    db.imports = []
    db.importRows = []
    db.links = []
    db.follows = []
    db.journals = [{ id: 10n, title: "Journal of Orthodontic Research", status: "active" }, { id: 11n, title: "Old Journal", status: "inactive" }]
    db.templates = []
    db.campaigns = []
})

describe("notifications admin routes — auth", () => {
    it("rejects anonymous and non-admin callers", async () => {
        mockSession = null
        expect((await upload("/imports", "l.csv", CSV)).status).toBe(401)
        mockSession = { id: "8", email: "u@example.org", role: "author" }
        expect((await app().request("/notifications/subscribers")).status).toBe(403)
    })
})

describe("import flow: upload → rows → mapping → confirm", () => {
    it("stages, maps a term, and confirms into pending subscribers plus a draft campaign", async () => {
        // Inspect is stateless.
        const inspect = await upload("/imports/inspect", "l.csv", CSV)
        expect(inspect.status).toBe(200)
        const insp = await inspect.json()
        expect(insp.data.detected_column_map).toEqual({ name: 0, email: 1, interests: 2 })
        expect(db.imports).toHaveLength(0)

        // Upload creates the staged import.
        const res = await upload("/imports", "l.csv", CSV)
        expect(res.status).toBe(201)
        const created = (await res.json()).data
        expect(created.totals).toEqual({ rows: 6, valid: 2, invalid: 1, duplicate: 1, existing: 1, suppressed: 1, unmapped_terms: 1 })
        expect(created.unmapped_terms).toEqual([{ term: "forensic odontology", count: 2 }])
        expect(created.uploaded_by).toBe("7")

        // Rows endpoint filters by issue and paginates.
        const rows = await (await app().request(`/notifications/imports/${created.id}/rows?issue=suppressed`)).json()
        expect(rows.pagination.total).toBe(1)
        expect(rows.data[0]).toMatchObject({ email: "gone@example.org", issue: "suppressed" })

        // Mapping a term saves a synonym and re-maps the rows.
        const mapRes = await app().request(`/notifications/imports/${created.id}/mapping`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mappings: [{ term: "Forensic Odontology", discipline_id: "3" }] }),
        })
        expect(mapRes.status).toBe(200)
        expect((await mapRes.json()).data.totals.unmapped_terms).toBe(0)
        expect(db.disciplines[2].synonyms).toEqual(["forensic odontology"])

        // Confirm: pending subscribers only, a draft campaign, nothing sent.
        const conf = await app().request(`/notifications/imports/${created.id}/confirm`, { method: "POST" })
        expect(conf.status).toBe(200)
        const body = await conf.json()
        expect(body.data.created).toBe(2)
        expect(body.data.campaign).toMatchObject({ type: "invitation", status: "draft", recipient_estimate: 2 })

        const added = db.subscribers.filter((s) => s.source === "import")
        expect(added.map((s) => [s.email, s.status])).toEqual([["amal@example.org", "pending"], ["sara@example.org", "pending"]])
        expect(added.every((s) => /^[0-9a-f]{64}$/.test(s.email_hash))).toBe(true)
        expect(db.subscribers.find((s) => s.email === "gone@example.org")!.status).toBe("bounced")
        expect(db.links.map((l) => [l.subscriber_id, l.discipline_id])).toEqual([
            [added[0].id, 1n], [added[0].id, 3n], [added[1].id, 3n],
        ])
        expect(db.templates[0]).toMatchObject({ name: "notify_import_invitation", category: "notification" })
        // No body keeps the stored assignment: General, so no journal follows and no journal on the invitation.
        expect(db.follows).toEqual([])
        expect(body.data.campaign.payload).toEqual({ import_id: String(created.id) })

        // A second confirm is refused.
        const again = await app().request(`/notifications/imports/${created.id}/confirm`, { method: "POST" })
        expect(again.status).toBe(409)
    })

    it("assigns a list to a journal: new people follow it and the invitation carries the journal", async () => {
        const created = (await (await upload("/imports", "l.csv", CSV)).json()).data
        const confirm = (journal_id: string | null) => app().request(`/notifications/imports/${created.id}/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ journal_id }),
        })
        // Unknown and inactive journals are refused before anything is created.
        expect((await confirm("99")).status).toBe(409)
        expect((await confirm("11")).status).toBe(409)
        expect(db.subscribers.filter((s) => s.source === "import")).toHaveLength(0)

        const res = await confirm("10")
        expect(res.status).toBe(200)
        const body = await res.json()
        const added = db.subscribers.filter((s) => s.source === "import")
        expect(db.follows).toEqual(added.map((s) => ({ subscriber_id: s.id, journal_id: 10n })))
        // The existing subscriber in the file is left alone.
        expect(db.follows.some((f) => f.subscriber_id === 1n)).toBe(false)
        expect(byId(db.imports, BigInt(created.id))!.journal_id).toBe(10n)
        expect(body.data.campaign.payload).toEqual({ import_id: String(created.id), journal_id: "10" })
    })

    it("confirms a General list explicitly", async () => {
        const created = (await (await upload("/imports", "l.csv", CSV)).json()).data
        const res = await app().request(`/notifications/imports/${created.id}/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ journal_id: null }),
        })
        expect(res.status).toBe(200)
        expect(byId(db.imports, BigInt(created.id))!.journal_id).toBeNull()
        expect(db.follows).toEqual([])
    })

    it("re-importing after a mapping auto-maps the learned term", async () => {
        db.disciplines[2].synonyms = ["forensic odontology"]
        const created = (await (await upload("/imports", "l.csv", CSV)).json()).data
        expect(created.totals.unmapped_terms).toBe(0)
    })

    it("rejects oversize files, bad column maps and unsupported types", async () => {
        process.env.MAX_FILE_SIZE_MB = "1"
        const big = await upload("/imports", "l.csv", "email\n" + "a".repeat(1024 * 1024 + 10))
        delete process.env.MAX_FILE_SIZE_MB
        expect(big.status).toBe(413)
        expect((await big.json()).error).toMatch(/limit is 1 MB/)

        const badMap = await upload("/imports", "l.csv", CSV, { column_map: JSON.stringify({ email: 9 }) })
        expect(badMap.status).toBe(409)

        const pdf = await upload("/imports", "l.pdf", CSV)
        expect(pdf.status).toBe(400)
    })

    it("cancel discards staging rows", async () => {
        const created = (await (await upload("/imports", "l.csv", CSV)).json()).data
        const res = await app().request(`/notifications/imports/${created.id}/cancel`, { method: "POST" })
        expect(res.status).toBe(200)
        expect(db.importRows).toHaveLength(0)
        expect(db.imports[0].status).toBe("cancelled")
    })
})
