import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

const journals = new Map<bigint, { title: string; ojs_path: string; invitation_scope: string }>([
    [BigInt(3), { title: "Journal of Orthodontic Research", ojs_path: "jor", invitation_scope: "a journal dedicated to orthodontics" }],
])
const prismaMock: any = {
    journal: { findUnique: vi.fn(async ({ where }: any) => (journals.has(where.id) ? { ...journals.get(where.id) } : null)) },
}
vi.mock("@/src/lib/db/config", () => ({ get prisma() { return prismaMock } }))

const sendMail = vi.fn(async () => ({}))
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail, close: vi.fn() }) } }))

const { automaticSenderName, senderNameFor } = await import("@/src/features/notifications/server/sender-name")
const { cleanSenderName, defaultSenderName } = await import("@/src/lib/email/sender-display-name")
const { SmtpNotificationTransport, notificationFromAddress } = await import("@/src/lib/email/notification-transport")
const { campaignJournalTitle, campaignJournal } = await import("@/src/features/notifications/server/sender-name")
const { composeMessage } = await import("@/src/features/notifications/server/compose")
const { TEMPLATE_SET } = await import("@/src/features/notifications/server/template-set")
const { EMAIL_STYLES } = await import("@/src/features/notifications/server/email-styles")

const ENV = ["NOTIFY_TOKEN_SECRET", "NOTIFY_FROM_NAME", "NOTIFY_SMTP_HOST", "NOTIFY_SMTP_USER", "NOTIFY_SMTP_PASSWORD", "NOTIFY_SMTP_FROM_EMAIL"] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
    vi.clearAllMocks()
    for (const k of ENV) saved[k] = process.env[k]
    delete process.env.NOTIFY_FROM_NAME
    process.env.NOTIFY_TOKEN_SECRET = "test-secret-test-secret-test-secret-0123"
    process.env.NOTIFY_SMTP_HOST = "smtp.example.org"
    process.env.NOTIFY_SMTP_USER = "noreply@digitopub.com"
    process.env.NOTIFY_SMTP_PASSWORD = "x"
    process.env.NOTIFY_SMTP_FROM_EMAIL = "noreply@digitopub.com"
})
afterEach(() => {
    for (const k of ENV) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))
})

const issueEvent = (journal_title: string) => ({ kind: "issue", snapshot: { journal_title } }) as any

describe("sender display name", () => {
    it("defaults to DigitoPub, or NOTIFY_FROM_NAME when set", () => {
        expect(defaultSenderName()).toBe("DigitoPub")
        expect(notificationFromAddress()).toBe('"DigitoPub" <noreply@digitopub.com>')
        process.env.NOTIFY_FROM_NAME = "DigitoPub Publishing"
        expect(notificationFromAddress()).toBe('"DigitoPub Publishing" <noreply@digitopub.com>')
    })

    it("only changes the name, never the address, and strips header injection", () => {
        expect(notificationFromAddress('Evil"\r\nBcc: x@y.z')).toBe('"Evil Bcc: x@y.z" <noreply@digitopub.com>')
        expect(cleanSenderName("a".repeat(150))).toHaveLength(100)
        expect(cleanSenderName("   ")).toBe("")
        expect(notificationFromAddress("   ")).toBe('"DigitoPub" <noreply@digitopub.com>')
    })

    it("uses the journal title for issue alerts and journal-linked campaigns", async () => {
        expect(await automaticSenderName({ type: "issue", payload: {} }, [issueEvent("Dental Materials Review")])).toBe("Dental Materials Review")
        expect(await automaticSenderName({ type: "invitation", payload: { journal_id: "3" } })).toBe("Journal of Orthodontic Research")
        expect(await automaticSenderName({ type: "custom", payload: { journal_id: "3" } })).toBe("Journal of Orthodontic Research")
    })

    it("uses the default for digests, general lists and unknown journals", async () => {
        expect(await automaticSenderName({ type: "digest_weekly", payload: { event_ids: ["1"] } })).toBeNull()
        expect(await automaticSenderName({ type: "invitation", payload: { import_id: "9" } })).toBeNull()
        expect(await automaticSenderName({ type: "custom", payload: { journal_id: "99" } })).toBeNull()
    })

    it("lets an admin's choice win", async () => {
        expect(await senderNameFor({ type: "issue", payload: { from_name: "The Editors" } }, [issueEvent("X")])).toBe("The Editors")
        expect(await senderNameFor({ type: "issue", payload: { from_name: "  " } }, [issueEvent("X")])).toBe("X")
    })

    it("sends each message under its own name from the same mailbox", async () => {
        const t = new SmtpNotificationTransport()
        await t.send({ to: "a@example.org", subject: "s", html: "h", text: "t", headers: {}, fromName: "Journal of Orthodontic Research" })
        await t.send({ to: "b@example.org", subject: "s", html: "h", text: "t", headers: {} })
        expect(sendMail.mock.calls.map((c: any[]) => c[0].from)).toEqual([
            '"Journal of Orthodontic Research" <noreply@digitopub.com>',
            '"DigitoPub" <noreply@digitopub.com>',
        ])
    })

    it("invites a journal-assigned list in the journal's name, about that journal", async () => {
        const campaign = { id: 5n, type: "invitation", subject_override: null, payload: { import_id: "9", journal_id: "3" } } as any
        const journalTitle = await campaignJournalTitle(campaign)
        expect(journalTitle).toBe("Journal of Orthodontic Research")
        const t = TEMPLATE_SET.notify_import_invitation
        const ctx = {
            campaign,
            template: { subject: t.subject, html_content: t.html_content, text_content: t.text_content },
            events: new Map(),
            rules: [],
            disciplineNames: new Map([["1", "Orthodontics"]]),
            publisherAddress: "DigitoPub, 5 Real Road",
            style: EMAIL_STYLES.classic,
            journalTitle,
            senderName: await senderNameFor(campaign, [], journalTitle),
        } as any
        const sub = { id: 0n, email: "a@example.org", name: "Dr A", status: "pending", token_version: 0, issue_alerts: true, article_frequency: "weekly", journal_ids: [], discipline_ids: [1n] }
        const m = (await composeMessage(ctx, sub))!
        expect(m.fromName).toBe("Journal of Orthodontic Research")
        expect(m.subject).toBe("Invitation: publication alerts in Journal of Orthodontic Research")

        // A General list keeps the discipline wording and the default sender.
        const general = { ...ctx, campaign: { ...campaign, payload: { import_id: "9" } }, journalTitle: null, senderName: null }
        const g = (await composeMessage(general, sub))!
        expect(g.fromName).toBeNull()
        expect(g.subject).toBe("Invitation: publication alerts in Orthodontics")
    })

    it("composes the journal invitation template with salutation, journal vars and a long expiry date", async () => {
        const campaign = { id: 6n, type: "invitation", subject_override: null, payload: { import_id: "9", journal_id: "3" } } as any
        const journal = await campaignJournal(campaign)
        const journalTitle = await campaignJournalTitle(campaign)
        const t = TEMPLATE_SET.notify_journal_invitation
        const ctx = {
            campaign,
            template: { subject: t.subject, html_content: t.html_content, text_content: t.text_content },
            events: new Map(),
            rules: [],
            disciplineNames: new Map(),
            publisherAddress: "DigitoPub, 5 Real Road",
            style: EMAIL_STYLES.classic,
            journalTitle,
            journal,
            senderName: await senderNameFor(campaign, [], journalTitle),
        } as any
        const sub = { id: 0n, email: "a@example.org", name: "Dr A", status: "pending", token_version: 0, issue_alerts: true, article_frequency: "weekly", journal_ids: [], discipline_ids: [1n] }
        const m = (await composeMessage(ctx, sub))!
        expect(m.subject).toBe("Stay connected with Journal of Orthodontic Research (JOR)")
        expect(m.html).toContain("Dear Dr. A")
        expect(m.html).not.toContain("Dr. Dr.")
        expect(m.html).toContain(", a journal dedicated to orthodontics.")
        expect(m.text).toMatch(/\d{1,2} [A-Z][a-z]+ \d{4}/)
    })
})
