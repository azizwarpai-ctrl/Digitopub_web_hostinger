import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

vi.mock("server-only", () => ({}))

let mockSession: { id: string; email: string; role: string } | null = null
vi.mock("@/src/lib/db/auth", () => ({
    getSession: vi.fn(() => mockSession),
    createSession: vi.fn(),
    destroySession: vi.fn(),
}))

const sendEmail = vi.fn(async ({ to }: { to: string }) => (to.startsWith("bounce") ? { success: false, error: "550 rejected" } : { success: true }))
vi.mock("@/src/lib/email/service", () => ({
    sendEmail: (m: { to: string }) => sendEmail(m),
    getEmailServiceStatus: vi.fn(),
}))

const logs: Array<Record<string, unknown>> = []
let seq = 1n
const prismaMock: any = {
    emailTemplate: {
        findUnique: vi.fn(async () => ({
            id: 5n, name: "welcome", subject: "Hello {{name}}", html_content: "<p>Hi {{name}}</p>", text_content: "Hi {{name}}",
            variables: ["name"], description: null, is_active: true, category: "transactional", created_at: new Date(), updated_at: new Date(),
        })),
    },
    emailLog: {
        create: vi.fn(async ({ data }: any) => {
            const row = { id: seq++, ...data }
            logs.push(row)
            return row
        }),
        update: vi.fn(async ({ where, data }: any) => Object.assign(logs.find((l) => l.id === where.id)!, data)),
    },
}
vi.mock("@/src/lib/db/config", () => ({ get prisma() { return prismaMock } }))

const { emailTemplateRouter } = await import("@/src/features/email-templates/server/route")

const sendTest = (json: unknown) => new Hono().route("/email-templates", emailTemplateRouter).request("/email-templates/5/send-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
})

beforeEach(() => {
    vi.clearAllMocks()
    logs.length = 0
    mockSession = { id: "7", email: "admin@example.org", role: "admin" }
})

describe("template send-test to several addresses", () => {
    it("sends and logs one email per address; one failure does not stop the others", async () => {
        const res = await sendTest({ recipients: ["a@x.org", "bounce@x.org", "B@x.org"], variables: { name: "Dr A" } })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toEqual({ sent: ["a@x.org", "b@x.org"], failed: [{ to: "bounce@x.org", error: "550 rejected" }] })
        expect(sendEmail.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(["a@x.org", "bounce@x.org", "b@x.org"])
        expect(logs.map((l) => [l.to_email, l.status])).toEqual([["a@x.org", "sent"], ["bounce@x.org", "failed"], ["b@x.org", "sent"]])
        expect(logs.every((l) => l.subject === "[TEST] Hello Dr A")).toBe(true)
    })

    it("still accepts a single to, and validates the list", async () => {
        expect((await sendTest({ to: "solo@x.org", variables: { name: "X" } })).status).toBe(200)
        expect((await sendTest({ variables: { name: "X" } })).status).toBe(400)
        expect((await sendTest({ recipients: Array.from({ length: 11 }, (_, i) => `t${i}@x.org`), variables: { name: "X" } })).status).toBe(400)
        mockSession = null
        expect((await sendTest({ to: "solo@x.org", variables: { name: "X" } })).status).toBe(401)
    })
})
