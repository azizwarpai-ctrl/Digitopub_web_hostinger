import { describe, it, expect } from "vitest"

import {
    effectiveRule,
    resolveDigest,
    resolveRecipients,
    type AudienceSubscriber,
    type RuleLike,
} from "@/src/features/notifications/server/resolve-recipients"
import { excerpt, resolveDisciplines } from "@/src/features/notifications/server/detect-publications"
import { buildDisciplineIndex } from "@/src/features/notifications/server/import/map-interests"

const rule = (over: Partial<RuleLike>): RuleLike => ({
    scope: "global", journal_id: null, discipline_id: null, event_type: "issue_published",
    enabled: true, auto_draft: true, template_id: null, ...over,
})
const sub = (over: Partial<AudienceSubscriber>): AudienceSubscriber => ({
    id: 1n, status: "active", issue_alerts: true, article_frequency: "weekly", journal_ids: [], discipline_ids: [], ...over,
})

describe("effectiveRule", () => {
    const rules = [
        rule({ scope: "global", enabled: true }),
        rule({ scope: "discipline", discipline_id: 5n, enabled: false }),
        rule({ scope: "journal", journal_id: 10n, enabled: false, template_id: 77n }),
    ]

    it("prefers journal, then discipline, then global, then defaults", () => {
        expect(effectiveRule(rules, "issue_published", 10n, [5n])).toMatchObject({ source: "journal", enabled: false, template_id: 77n })
        expect(effectiveRule(rules, "issue_published", 11n, [5n])).toMatchObject({ source: "discipline", enabled: false })
        expect(effectiveRule(rules, "issue_published", 11n, [6n])).toMatchObject({ source: "global", enabled: true })
        expect(effectiveRule([], "article_digest", null, [])).toMatchObject({ source: "default", enabled: true, auto_draft: true })
    })

    it("is enabled when any applicable discipline rule is enabled", () => {
        const r = [...rules, rule({ scope: "discipline", discipline_id: 6n, enabled: true })]
        expect(effectiveRule(r, "issue_published", 11n, [5n, 6n]).enabled).toBe(true)
    })

    it("only considers rules for the requested event type", () => {
        expect(effectiveRule(rules, "article_digest", 10n, []).source).toBe("default")
    })
})

describe("resolveRecipients", () => {
    const event = { event_type: "issue_published" as const, journal_id: 10n, discipline_ids: [5n, 6n] }

    it("selects active subscribers who follow the journal or share a discipline", () => {
        const subs = [
            sub({ id: 1n, journal_ids: [10n] }),
            sub({ id: 2n, discipline_ids: [6n] }),
            sub({ id: 3n, discipline_ids: [99n] }),
            sub({ id: 4n, journal_ids: [10n], status: "pending" }),
            sub({ id: 5n, journal_ids: [10n], status: "unsubscribed" }),
        ]
        expect(resolveRecipients(event, subs, [])).toEqual([1n, 2n])
    })

    it("honours issue_alerts and digest frequency", () => {
        expect(resolveRecipients(event, [sub({ journal_ids: [10n], issue_alerts: false })], [])).toEqual([])
        const digest = { ...event, event_type: "article_digest" as const }
        const subs = [sub({ id: 1n, journal_ids: [10n], article_frequency: "daily" }), sub({ id: 2n, journal_ids: [10n] })]
        expect(resolveRecipients(digest, subs, [], { frequency: "daily" })).toEqual([1n])
        expect(resolveRecipients(digest, subs, [], { frequency: "weekly" })).toEqual([2n])
    })

    it("applies the rule for the way each subscriber matched", () => {
        const rules = [rule({ scope: "discipline", discipline_id: 6n, enabled: false })]
        const subs = [sub({ id: 1n, discipline_ids: [6n] }), sub({ id: 2n, discipline_ids: [5n] })]
        expect(resolveRecipients(event, subs, rules)).toEqual([2n])
        // A disabled journal rule overrides everything for that journal.
        expect(resolveRecipients(event, subs, [rule({ scope: "journal", journal_id: 10n, enabled: false })])).toEqual([])
    })
})

describe("resolveDigest", () => {
    it("groups articles per subscriber and omits subscribers with none", () => {
        const events = [
            { id: 100n, event_type: "article_digest" as const, journal_id: 10n, discipline_ids: [] },
            { id: 101n, event_type: "article_digest" as const, journal_id: 11n, discipline_ids: [5n] },
        ]
        const subs = [
            sub({ id: 1n, journal_ids: [10n], discipline_ids: [5n] }),
            sub({ id: 2n, discipline_ids: [5n] }),
            sub({ id: 3n, discipline_ids: [9n] }),
        ]
        const out = resolveDigest(events, subs, [], "weekly")
        expect(out.get(1n)).toEqual([100n, 101n])
        expect(out.get(2n)).toEqual([101n])
        expect(out.has(3n)).toBe(false)
    })
})

describe("resolveDisciplines", () => {
    const ctx = {
        index: buildDisciplineIndex([
            { id: 2n, name: "Orthodontics", synonyms: ["clear aligners", "malocclusion"] },
            { id: 3n, name: "Endodontics", synonyms: ["root canal"] },
        ]),
        sectionMap: new Map([["40", [7n]]]),
    }

    it("unions journal mapping, section mapping and keyword matches", () => {
        expect(resolveDisciplines([1n], 40, ["Clear aligners", "unrelated"], ctx).sort()).toEqual([1n, 2n, 7n])
        expect(resolveDisciplines([], null, ["Root canal"], ctx)).toEqual([3n])
    })
})

describe("excerpt", () => {
    it("strips markup and limits to ~50 words", () => {
        expect(excerpt("<p>Hello&nbsp;<b>world</b></p>")).toBe("Hello world")
        const long = Array.from({ length: 80 }, (_, i) => `w${i}`).join(" ")
        expect(excerpt(long).split(" ")).toHaveLength(50)
        expect(excerpt(long).endsWith("…")).toBe(true)
        expect(excerpt(null)).toBe("")
    })
})
