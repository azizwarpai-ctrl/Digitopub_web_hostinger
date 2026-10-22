import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/src/lib/email/notification-transport", () => ({
    getNotificationTransport: () => ({ send: vi.fn(async () => ({ ok: true })) }),
    notificationFromAddress: () => '"DigitoPub Alerts" <alerts@example.org>',
}))

type Row = Record<string, any> & { id: bigint }
const db = {
    campaigns: [] as Row[],
    deliveries: [] as Array<{ campaign_id: bigint; subscriber_id: bigint }>,
    subscribers: [] as Row[],
    events: [] as Row[],
    rules: [] as Row[],
}
let seq = 1n

function matches(row: Record<string, any>, where: Record<string, any> = {}): boolean {
    return Object.entries(where).every(([k, v]) => {
        if (v && typeof v === "object" && typeof v !== "bigint" && "in" in v) return v.in.includes(row[k])
        return row[k] === v
    })
}

const prismaMock: any = {
    notificationCampaign: {
        findUnique: vi.fn(async ({ where }: any) => {
            const c = db.campaigns.find((r) => r.id === where.id)
            return c ? { ...c } : null
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
            const hits = db.campaigns.filter((r) => matches(r, where))
            hits.forEach((r) => Object.assign(r, data))
            return { count: hits.length }
        }),
        update: vi.fn(async ({ where, data }: any) => Object.assign(db.campaigns.find((r) => r.id === where.id)!, data)),
    },
    notificationDelivery: {
        createMany: vi.fn(async ({ data, skipDuplicates }: any) => {
            let count = 0
            for (const d of data) {
                if (db.deliveries.some((x) => x.campaign_id === d.campaign_id && x.subscriber_id === d.subscriber_id)) {
                    if (!skipDuplicates) throw new Error("dup")
                    continue
                }
                db.deliveries.push(d)
                count++
            }
            return { count }
        }),
    },
    notificationSubscriber: {
        findMany: vi.fn(async ({ where }: any) => db.subscribers.filter((s) => matches(s, where)).map((s) => ({
            ...s, journals: (s.journal_ids ?? []).map((journal_id: bigint) => ({ journal_id })), disciplines: [],
        }))),
    },
    notificationRule: {
        findMany: vi.fn(async () => db.rules),
        upsert: vi.fn(async ({ where, update, create }: any) => {
            const key = where.scope_key_event_type
            const existing = db.rules.find((r) => r.scope_key === key.scope_key && r.event_type === key.event_type)
            if (existing) return Object.assign(existing, update)
            const row = { id: seq++, ...create }
            db.rules.push(row)
            return row
        }),
        findUnique: vi.fn(async ({ where }: any) => db.rules.find((r) => r.id === where.id) ?? null),
        delete: vi.fn(async ({ where }: any) => { db.rules = db.rules.filter((r) => r.id !== where.id) }),
    },
    publicationEvent: { findMany: vi.fn(async ({ where }: any) => db.events.filter((e) => where.id.in.includes(e.id))) },
    emailTemplate: { findUnique: vi.fn(async () => ({ category: "notification" })) },
}
vi.mock("@/src/lib/db/config", () => ({ get prisma() { return prismaMock } }))

import { approveCampaign, updateDraft, CampaignStateError } from "@/src/features/notifications/server/campaign-service"
import { deleteRule, upsertRule, RuleInputError } from "@/src/features/notifications/server/admin-config-service"
import { effectiveRule } from "@/src/features/notifications/server/resolve-recipients"

const issueEvent = { id: 50n, kind: "issue", discipline_ids: [], snapshot: { journal_id: "10" } }

beforeEach(() => {
    seq = 100n
    db.campaigns = [{ id: 1n, type: "issue", status: "draft", payload: { event_ids: ["50"] }, recipient_estimate: 0 }]
    db.deliveries = []
    db.events = [issueEvent]
    db.rules = []
    db.subscribers = [
        { id: 1n, status: "active", issue_alerts: true, article_frequency: "weekly", journal_ids: [10n] },
        { id: 2n, status: "active", issue_alerts: true, article_frequency: "weekly", journal_ids: [10n] },
        { id: 3n, status: "active", issue_alerts: true, article_frequency: "weekly", journal_ids: [99n] },
    ]
})

describe("approveCampaign", () => {
    it("re-resolves the audience, creates deliveries and queues the campaign", async () => {
        const r = await approveCampaign(1n, 7n)
        expect(r).toEqual({ status: "queued", recipients: 2 })
        expect(db.deliveries.map((d) => d.subscriber_id)).toEqual([1n, 2n])
        expect(db.campaigns[0]).toMatchObject({ status: "queued", approved_by: 7n, recipient_estimate: 2 })
    })

    it("honours unsubscribes made after drafting", async () => {
        // loadActiveAudience only returns active rows; simulate an unsubscribe.
        db.subscribers[1].status = "unsubscribed"
        prismaMock.notificationSubscriber.findMany.mockImplementationOnce(async () =>
            db.subscribers.filter((s) => s.status === "active").map((s) => ({ ...s, journals: s.journal_ids.map((journal_id: bigint) => ({ journal_id })), disciplines: [] })))
        const r = await approveCampaign(1n, 7n)
        expect(r?.recipients).toBe(1)
    })

    it("schedules for a future time and refuses a past one or a second approval", async () => {
        await expect(approveCampaign(1n, 7n, new Date(Date.now() - 1000))).rejects.toBeInstanceOf(CampaignStateError)
        const future = new Date(Date.now() + 3600_000)
        expect((await approveCampaign(1n, 7n, future))?.status).toBe("scheduled")
        expect(db.campaigns[0].scheduled_at).toEqual(future)
        await expect(approveCampaign(1n, 7n)).rejects.toBeInstanceOf(CampaignStateError)
    })

    it("lets an admin drop items from a draft before approving", async () => {
        const r = await updateDraft(1n, { excluded_event_ids: ["50", "999"], editor_note: "Note" })
        expect(r?.recipient_estimate).toBe(0)
        expect(db.campaigns[0].payload).toMatchObject({ excluded_event_ids: ["50"], editor_note: "Note" })
        expect(await approveCampaign(1n, 7n)).toEqual({ status: "sent", recipients: 0 })
    })

    it("stores a cleaned sender name on the draft, and clears it when emptied", async () => {
        await updateDraft(1n, { from_name: '  The "Editors"\n' })
        expect(db.campaigns[0].payload).toMatchObject({ event_ids: ["50"], from_name: "The Editors" })
        await updateDraft(1n, { from_name: "" })
        expect(db.campaigns[0].payload.from_name).toBeNull()
    })

    it("approves invitations for the import's pending subscribers only", async () => {
        db.campaigns = [{ id: 2n, type: "invitation", status: "draft", payload: { import_id: "9" } }]
        db.subscribers = [
            { id: 11n, status: "pending", import_id: 9n },
            { id: 12n, status: "unsubscribed", import_id: 9n },
            { id: 13n, status: "pending", import_id: 8n },
        ]
        expect(await approveCampaign(2n, 7n)).toEqual({ status: "queued", recipients: 1 })
        expect(db.deliveries).toEqual([{ campaign_id: 2n, subscriber_id: 11n }])
    })
})

describe("rules CRUD", () => {
    it("upserts one rule per target and event type, and the override wins", async () => {
        await upsertRule({ scope: "global", event_type: "issue_published", enabled: true, auto_draft: true }, 7n)
        await upsertRule({ scope: "journal", journal_id: "10", event_type: "issue_published", enabled: false, auto_draft: true }, 7n)
        await upsertRule({ scope: "journal", journal_id: "10", event_type: "issue_published", enabled: false, auto_draft: false }, 7n)
        expect(db.rules).toHaveLength(2)
        expect(db.rules[1]).toMatchObject({ scope_key: "journal:10", journal_id: 10n, auto_draft: false, updated_by: 7n })
        expect(effectiveRule(db.rules as any, "issue_published", 10n, []).enabled).toBe(false)
        expect(effectiveRule(db.rules as any, "issue_published", 11n, []).enabled).toBe(true)
    })

    it("validates targets and protects global rules", async () => {
        await expect(upsertRule({ scope: "discipline", event_type: "article_digest", enabled: true, auto_draft: true }, 7n))
            .rejects.toBeInstanceOf(RuleInputError)
        const g = await upsertRule({ scope: "global", event_type: "article_digest", enabled: true, auto_draft: true }, 7n)
        expect(await deleteRule(g.id)).toBe("global")
        const j = await upsertRule({ scope: "journal", journal_id: "10", event_type: "article_digest", enabled: true, auto_draft: true }, 7n)
        expect(await deleteRule(j.id)).toBe("deleted")
        expect(await deleteRule(12345n)).toBe("not_found")
    })
})
