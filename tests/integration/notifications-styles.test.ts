import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

vi.mock("server-only", () => ({}))

let mockSession: { id: string; email: string; role: string } | null = null
vi.mock("@/src/lib/db/auth", () => ({
    getSession: vi.fn(() => mockSession),
    createSession: vi.fn(),
    destroySession: vi.fn(),
}))

type Row = { name: string; subject: string; html_content: string; text_content: string | null; variables: string[] }
const db = {
    templates: new Map<string, Row>(),
    settings: null as Record<string, unknown> | null,
}

const prismaMock: any = {
    emailTemplate: {
        findMany: vi.fn(async ({ where }: any) => [...db.templates.values()].filter((t) => where.name.in.includes(t.name))),
        update: vi.fn(async ({ where, data }: any) => ({ op: "template", name: where.name, data })),
    },
    systemSetting: {
        findUnique: vi.fn(async () => (db.settings ? { setting_value: db.settings } : null)),
        upsert: vi.fn(async ({ update }: any) => ({ op: "settings", value: update.setting_value })),
    },
    $transaction: vi.fn(async (ops: Promise<any>[]) => {
        for (const r of await Promise.all(ops)) {
            if (r.op === "template") Object.assign(db.templates.get(r.name)!, r.data)
            else db.settings = r.value
        }
    }),
}
vi.mock("@/src/lib/db/config", () => ({ get prisma() { return prismaMock } }))

const { notificationsRouter } = await import("@/src/features/notifications/server")
const { EMAIL_STYLES } = await import("@/src/features/notifications/server/email-styles")
const { TEMPLATE_SET, buildTemplateSet } = await import("@/src/features/notifications/server/template-set")
const { buildToc } = await import("@/src/features/notifications/server/render-blocks")

const app = () => new Hono().route("/notifications", notificationsRouter)
const get = (path: string) => app().request(`/notifications${path}`)
const apply = (key: string, json: unknown = {}) => app().request(`/notifications/styles/${key}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(json),
})

/** Installs the shipped Classic set, as "Install starter data" would. */
function installClassic() {
    for (const [name, t] of Object.entries(TEMPLATE_SET)) {
        db.templates.set(name, { name, subject: t.subject, html_content: t.html_content, text_content: t.text_content, variables: [...t.variables] })
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    mockSession = { id: "7", email: "admin@example.org", role: "admin" }
    db.templates.clear()
    db.settings = null
})

describe("style gallery routes", () => {
    it("rejects anonymous and non-admin callers", async () => {
        mockSession = null
        expect((await get("/styles")).status).toBe(401)
        mockSession = { id: "8", email: "u@example.org", role: "author" }
        expect((await apply("modern")).status).toBe(403)
    })

    it("lists the styles with Classic active by default", async () => {
        installClassic()
        const body = await (await get("/styles")).json()
        expect(body.data.active).toBe("classic")
        expect(body.data.styles.map((s: { key: string }) => s.key)).toEqual(["classic", "modern", "minimal"])
        expect(body.data.customised).toEqual([])
    })

    it("previews a style with sample data and the saved postal address", async () => {
        db.settings = { publisher_address: "DigitoPub, 5 Real Road, Tripoli" }
        const body = await (await get("/styles/modern/preview?template=notify_weekly_digest")).json()
        expect(body.data.subject).toContain("week of")
        expect(body.data.html).toContain(EMAIL_STYLES.modern.colors.accent)
        expect(body.data.html).toContain("5 Real Road")
        expect(body.data.html).not.toMatch(/\{\{/)
    })

    it("rejects unknown styles and templates", async () => {
        expect((await get("/styles/neon/preview")).status).toBe(400)
        expect((await get("/styles/modern/preview?template=notify_nope")).status).toBe(400)
        expect((await apply("neon")).status).toBe(400)
    })

    it("applies a style to un-edited templates, keeps edited ones and the admin's subjects and text", async () => {
        installClassic()
        db.templates.get("notify_welcome")!.html_content = "<p>my own design</p>"
        db.templates.get("notify_new_issue")!.subject = "Edited subject {{journal_title}}"
        db.templates.get("notify_new_issue")!.text_content = "Edited text {{issue_url}}"

        const res = await apply("modern")
        expect(res.status).toBe(200)
        const { data } = await res.json()
        expect(data.skipped).toEqual(["notify_welcome"])
        expect(data.applied).toHaveLength(6)

        const modern = buildTemplateSet(EMAIL_STYLES.modern)
        expect(db.templates.get("notify_new_issue")!.html_content).toBe(modern.notify_new_issue.html_content)
        expect(db.templates.get("notify_new_issue")!.subject).toBe("Edited subject {{journal_title}}")
        expect(db.templates.get("notify_new_issue")!.text_content).toBe("Edited text {{issue_url}}")
        expect(db.templates.get("notify_welcome")!.html_content).toBe("<p>my own design</p>")
        expect(db.settings?.email_style).toBe("modern")

        // The edited template now counts as customised against the new style.
        const listed = await (await get("/styles")).json()
        expect(listed.data.active).toBe("modern")
        expect(listed.data.customised).toEqual(["notify_welcome"])
    })

    it("replaces edited templates too when asked", async () => {
        installClassic()
        db.templates.get("notify_welcome")!.html_content = "<p>my own design</p>"
        const { data } = await (await apply("minimal", { overwriteCustomised: true })).json()
        expect(data.skipped).toEqual([])
        expect(db.templates.get("notify_welcome")!.html_content).toBe(buildTemplateSet(EMAIL_STYLES.minimal).notify_welcome.html_content)
    })

    it("keeps other settings when the style changes", async () => {
        db.settings = { publisher_address: "DigitoPub, 5 Real Road, Tripoli", weekly_digest_day: 3 }
        await apply("modern")
        expect(db.settings).toMatchObject({ publisher_address: "DigitoPub, 5 Real Road, Tripoli", weekly_digest_day: 3, email_style: "modern" })
    })

    it("draws the issue table of contents in the requested style", () => {
        const issue = { articles: [{ title: "T", authors: [], doi: null, section: "S", is_open_access: false, url: "https://x.org/a" }] } as any
        expect(buildToc(issue).html).toContain("#1F3A5F")
        expect(buildToc(issue, EMAIL_STYLES.modern).html).toContain(EMAIL_STYLES.modern.colors.accent)
    })
})
