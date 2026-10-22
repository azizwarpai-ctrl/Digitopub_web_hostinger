import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

vi.mock("server-only", () => ({}))
vi.mock("@/src/lib/email/service", () => ({ sendEmail: vi.fn(async () => ({ success: true })) }))
vi.mock("@/src/lib/cron-lock", () => ({ acquireJobLock: vi.fn(async () => true) }))
vi.mock("@/src/features/ojs/server/sync-runs", () => ({
    withSyncRun: vi.fn(async (_n: string, _t: string, fn: () => Promise<{ result: unknown }>) => (await fn()).result),
}))

// ── OJS stand-in ────────────────────────────────────────────────────────────
const ojs = {
    now: "2026-10-21 10:00:00",
    issues: [] as Array<{ issue_id: number; journal_id: number; date_published: string; lm: string }>,
    pubs: [] as Array<{ publication_id: number; submission_id: number; issue_id: number | null; journal_id: number; date_published: string; lm: string }>,
    lastParams: [] as unknown[],
}
vi.mock("@/src/features/ojs/server/ojs-client", () => ({
    ojsQuery: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("NOW()")) return [{ now: ojs.now }]
        if (sql.includes("FROM issues i")) { ojs.lastParams = params; return ojs.issues }
        if (sql.includes("FROM publications p")) return ojs.pubs
        if (sql.includes("FROM journals j")) return [{ primary_locale: "en", path: "jor", title: "OJS title" }]
        return []
    }),
}))

const article = (submissionId: number, keywords: string[] = []) => ({
    publicationId: submissionId * 10, submissionId, title: `Article ${submissionId}`, abstract: "<p>An abstract.</p>",
    authors: [{ givenName: "Ada", familyName: "Lovelace" }], datePublished: "2026-10-21", sectionTitle: "Research",
    sectionId: 40, articleCoverUrl: null, pdfUrl: null, pdfDownloadUrl: null, doi: "10.1/x", keywords,
    isOpenAccess: true, audioUrl: null, audioDurationSeconds: null,
})
const issueArticles: Record<number, ReturnType<typeof article>[]> = {}
vi.mock("@/src/features/journals/server/archive-issue-service", () => ({
    fetchIssueWithArticles: vi.fn(async (_j: string, issueId: number) => ({
        issueId, title: "Autumn", volume: 3, number: "2", year: 2026, datePublished: "2026-10-21 09:00:00",
        description: null, showVolume: true, showNumber: true, showYear: true, showTitle: true, urlPath: null,
        articles: issueArticles[issueId] ?? [], issueCoverUrl: null,
    })),
}))
vi.mock("@/src/features/journals/server/ojs-article-utils", () => ({
    fetchArticlesWithAuthors: vi.fn(async (issueId: number) => issueArticles[issueId] ?? []),
}))

// ── Prisma stand-in ─────────────────────────────────────────────────────────
type Row = Record<string, any> & { id: bigint }
let seq = 1n
const db = {
    settings: new Map<string, unknown>(),
    events: [] as Row[],
    campaigns: [] as Row[],
    rules: [] as Row[],
    subscribers: [] as Row[],
}
const prismaMock: any = {
    systemSetting: {
        findUnique: vi.fn(async ({ where }: any) => db.settings.has(where.setting_key) ? { setting_value: db.settings.get(where.setting_key) } : null),
        upsert: vi.fn(async ({ where, update, create }: any) => {
            db.settings.set(where.setting_key, db.settings.has(where.setting_key) ? update.setting_value : create.setting_value)
        }),
    },
    discipline: { findMany: vi.fn(async () => [{ id: 2n, name: "Orthodontics", synonyms: ["clear aligners"] }]) },
    ojsSectionDiscipline: { findMany: vi.fn(async () => []) },
    journal: { findFirst: vi.fn(async () => ({ id: 10n, title: "Journal of Orthodontic Research", issn: "1234-5678", disciplines: [] })) },
    publicationEvent: {
        create: vi.fn(async ({ data }: any) => {
            if (db.events.some((e) => e.dedupe_key === data.dedupe_key)) {
                const { Prisma } = await import("@prisma/client")
                throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "7" })
            }
            const row = { id: seq++, campaign_id: null, detected_at: new Date(), ...data }
            db.events.push(row)
            return { id: row.id }
        }),
        findMany: vi.fn(async ({ where }: any) => db.events.filter((e) =>
            (!where.id || where.id.in.includes(e.id)) &&
            (where.campaign_id === undefined || (where.campaign_id === null ? e.campaign_id === null : e.campaign_id !== null)) &&
            (!where.kind || e.kind === where.kind) &&
            (!where.ojs_issue_id || where.ojs_issue_id.in.includes(e.ojs_issue_id)) &&
            (!where.detected_at || (e.detected_at > where.detected_at.gt && e.detected_at <= where.detected_at.lte)))),
        update: vi.fn(async ({ where, data }: any) => Object.assign(db.events.find((e) => e.id === where.id)!, data)),
    },
    notificationRule: { findMany: vi.fn(async () => db.rules) },
    notificationSubscriber: { findMany: vi.fn(async () => db.subscribers) },
    notificationCampaign: {
        create: vi.fn(async ({ data }: any) => { const row = { id: seq++, ...data }; db.campaigns.push(row); return { id: row.id } }),
    },
    emailTemplate: { upsert: vi.fn(async () => ({ id: 500n })) },
    adminUser: { findMany: vi.fn(async () => [{ email: "admin@example.org" }]) },
}
vi.mock("@/src/lib/db/config", () => ({ get prisma() { return prismaMock } }))

process.env.CRON_SECRET = "cron-test-secret"
process.env.NEXT_PUBLIC_APP_URL = "https://digitopub.test"

import { detectPublications, DETECT_WATERMARK_KEY } from "@/src/features/notifications/server/detect-publications"
import { buildDigest } from "@/src/features/notifications/server/digests"
import { notificationsCronRouter } from "@/src/features/notifications/server/cron-route"

const follower = { id: 900n, status: "active", issue_alerts: true, article_frequency: "weekly", journals: [{ journal_id: 10n }], disciplines: [] }

beforeEach(() => {
    seq = 1n
    db.settings = new Map()
    db.events = []
    db.campaigns = []
    db.rules = []
    db.subscribers = [follower]
    ojs.issues = []
    ojs.pubs = []
    for (const k of Object.keys(issueArticles)) delete issueArticles[Number(k)]
    delete process.env.NOTIFICATIONS_ENABLED
})

describe("detectPublications", () => {
    it("only stores the watermark on the first run", async () => {
        ojs.issues = [{ issue_id: 1, journal_id: 7, date_published: "2020-01-01", lm: "2020-01-01 00:00:00" }]
        const r = await detectPublications()
        expect(r).toMatchObject({ initialised: true, issues: 0, articles: 0, drafts: 0 })
        expect(db.settings.get(DETECT_WATERMARK_KEY)).toBe(ojs.now)
        expect(db.events).toHaveLength(0)
    })

    it("records a new issue and its articles once, drafts one campaign, and is idempotent", async () => {
        db.settings.set(DETECT_WATERMARK_KEY, "2026-10-21 08:00:00")
        ojs.issues = [{ issue_id: 5, journal_id: 7, date_published: "2026-10-21", lm: "2026-10-21 09:00:00" }]
        issueArticles[5] = [article(51, ["Clear aligners"]), article(52)]

        const first = await detectPublications()
        expect(first).toMatchObject({ issues: 1, articles: 2, drafts: 1, partial: false })
        expect(ojs.lastParams).toEqual(["2026-10-21 08:00:00", "2026-10-21 08:00:00"])
        expect(db.settings.get(DETECT_WATERMARK_KEY)).toBe(ojs.now)

        const issue = db.events.find((e) => e.kind === "issue")!
        expect(issue.dedupe_key).toBe("issue:5")
        expect(issue.snapshot.articles).toHaveLength(2)
        expect(issue.snapshot.url).toBe("https://digitopub.test/journals/7/issues/3/2")
        const a51 = db.events.find((e) => e.dedupe_key === "article:51")!
        expect(a51.discipline_ids).toEqual(["2"]) // "Clear aligners" → Orthodontics
        expect(a51.snapshot).toMatchObject({ title: "Article 51", authors: [{ name: "Ada Lovelace" }], journal_id: "10" })

        expect(db.campaigns).toHaveLength(1)
        expect(db.campaigns[0]).toMatchObject({ type: "issue", status: "draft", template_id: 500n, recipient_estimate: 1 })
        expect(issue.campaign_id).toBe(db.campaigns[0].id)

        const again = await detectPublications()
        expect(again).toMatchObject({ issues: 0, articles: 0, drafts: 0 })
        expect(db.events).toHaveLength(3)
        expect(db.campaigns).toHaveLength(1)
    })

    it("does not draft when the journal rule is disabled, even with an enabled global rule", async () => {
        db.settings.set(DETECT_WATERMARK_KEY, "2026-10-21 08:00:00")
        db.rules = [
            { scope: "global", journal_id: null, discipline_id: null, event_type: "issue_published", enabled: true, auto_draft: true, template_id: null },
            { scope: "journal", journal_id: 10n, discipline_id: null, event_type: "issue_published", enabled: false, auto_draft: true, template_id: null },
        ]
        ojs.issues = [{ issue_id: 6, journal_id: 7, date_published: "2026-10-21", lm: "2026-10-21 09:00:00" }]
        const r = await detectPublications()
        expect(r.issues).toBe(1)
        expect(r.drafts).toBe(0)
    })

    it("records continuous-publishing articles outside a new issue", async () => {
        db.settings.set(DETECT_WATERMARK_KEY, "2026-10-21 08:00:00")
        issueArticles[8] = [article(81), article(82)]
        ojs.pubs = [{ publication_id: 810, submission_id: 81, issue_id: 8, journal_id: 7, date_published: "2026-10-21", lm: "2026-10-21 09:00:00" }]
        const r = await detectPublications()
        expect(r).toMatchObject({ issues: 0, articles: 1, drafts: 0 })
        expect(db.events.map((e) => e.dedupe_key)).toEqual(["article:81"])
    })

    it("resumes a capped run from the last processed candidate", async () => {
        db.settings.set(DETECT_WATERMARK_KEY, "2026-10-01 00:00:00")
        ojs.pubs = Array.from({ length: 201 }, (_, i) => ({
            publication_id: 1000 + i, submission_id: 2000 + i, issue_id: null, journal_id: 7,
            date_published: "2026-10-02", lm: `2026-10-02 00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`,
        }))
        const r = await detectPublications()
        expect(r.partial).toBe(true)
        expect(db.settings.get(DETECT_WATERMARK_KEY)).toBe(ojs.pubs[199].lm)
    })
})

describe("buildDigest", () => {
    it("drafts a digest of unannounced articles and advances a contiguous window", async () => {
        const t0 = new Date("2026-10-20T07:00:00Z")
        const now = new Date("2026-10-21T07:00:00Z")
        db.settings.set("notify_digest_weekly_last", t0.toISOString())
        const mk = (key: string, issueId: bigint | null, at: Date) => db.events.push({
            id: seq++, kind: "article", dedupe_key: key, ojs_issue_id: issueId, campaign_id: null, detected_at: at,
            published_at: at, discipline_ids: [], snapshot: { journal_id: "10" },
        })
        mk("article:1", 5n, new Date("2026-10-20T12:00:00Z"))   // in an announced issue → excluded
        mk("article:2", null, new Date("2026-10-20T13:00:00Z")) // included
        mk("article:3", null, new Date("2026-10-19T13:00:00Z")) // before the window
        db.events.push({ id: seq++, kind: "issue", dedupe_key: "issue:5", ojs_issue_id: 5n, campaign_id: 77n, detected_at: now })

        const r = await buildDigest("weekly", now)
        expect(r).toMatchObject({ articles: 1, recipients: 1, drafted: true })
        expect(db.campaigns[0]).toMatchObject({ type: "digest_weekly", status: "draft", recipient_estimate: 1 })
        expect(db.campaigns[0].payload.window).toEqual({ from: t0.toISOString(), to: now.toISOString() })
        expect(db.settings.get("notify_digest_weekly_last")).toBe(now.toISOString())
    })

    it("skips an empty digest but still advances the window", async () => {
        const now = new Date("2026-10-21T07:00:00Z")
        const r = await buildDigest("daily", now)
        expect(r).toMatchObject({ articles: 0, drafted: false })
        expect(db.campaigns).toHaveLength(0)
        expect(db.settings.get("notify_digest_daily_last")).toBe(now.toISOString())
    })
})

describe("cron router", () => {
    const app = new Hono().route("/notifications/cron", notificationsCronRouter)
    const call = (path: string, auth = "Bearer cron-test-secret") =>
        app.request(`http://test/notifications/cron${path}`, { method: "POST", headers: { authorization: auth } })

    it("requires CRON_SECRET", async () => {
        expect((await call("/detect", "Bearer nope")).status).toBe(401)
    })

    it("is a no-op while NOTIFICATIONS_ENABLED is not true", async () => {
        const res = await call("/detect")
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ success: true, skipped: true })
        expect(db.settings.size).toBe(0)
    })

    it("runs detection when enabled", async () => {
        process.env.NOTIFICATIONS_ENABLED = "true"
        const res = await call("/detect")
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ success: true, initialised: true })
    })
})
