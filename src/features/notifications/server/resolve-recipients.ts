/**
 * Pure audience logic for publication notifications (#200). Used twice per
 * campaign: at draft time for `recipient_estimate`, and again at approval
 * (#202) to create the delivery rows, which picks up unsubscribes made in
 * between.
 */

import type { ArticleFrequency, RuleEventType } from "../constants"

export interface RuleLike {
    scope: string
    journal_id: bigint | null
    discipline_id: bigint | null
    event_type: string
    enabled: boolean
    auto_draft: boolean
    template_id: bigint | null
}

export interface EffectiveRule {
    enabled: boolean
    auto_draft: boolean
    template_id: bigint | null
    source: "journal" | "discipline" | "global" | "default"
}

/**
 * Most specific rule wins: journal, then discipline, then global. When
 * several discipline rules apply, the event is allowed if any of them is
 * enabled (a researcher matched through one discipline should not lose the
 * alert because another discipline is switched off).
 */
export function effectiveRule(
    rules: RuleLike[],
    eventType: RuleEventType,
    journalId: bigint | null,
    disciplineIds: bigint[],
): EffectiveRule {
    const forType = rules.filter((r) => r.event_type === eventType)

    const journal = journalId !== null ? forType.find((r) => r.scope === "journal" && r.journal_id === journalId) : undefined
    if (journal) return { ...pick(journal), source: "journal" }

    const ids = new Set(disciplineIds.map(String))
    const discipline = forType.filter((r) => r.scope === "discipline" && r.discipline_id !== null && ids.has(String(r.discipline_id)))
    if (discipline.length) {
        const enabled = discipline.filter((r) => r.enabled)
        return {
            enabled: enabled.length > 0,
            auto_draft: enabled.some((r) => r.auto_draft),
            template_id: (enabled[0] ?? discipline[0]).template_id,
            source: "discipline",
        }
    }

    const global = forType.find((r) => r.scope === "global")
    if (global) return { ...pick(global), source: "global" }

    return { enabled: true, auto_draft: true, template_id: null, source: "default" }
}

function pick(r: RuleLike) {
    return { enabled: r.enabled, auto_draft: r.auto_draft, template_id: r.template_id }
}

export interface AudienceEvent {
    event_type: RuleEventType
    journal_id: bigint | null
    discipline_ids: bigint[]
}

export interface AudienceSubscriber {
    id: bigint
    status: string
    issue_alerts: boolean
    article_frequency: ArticleFrequency | string
    journal_ids: bigint[]
    discipline_ids: bigint[]
}

/**
 * Subscribers who should receive `event`:
 * 1. active, and following the journal OR sharing at least one discipline;
 * 2. allowed by the effective rule for the way they matched;
 * 3. allowed by their preferences (issue alerts on; for digests, the matching
 *    frequency is chosen by the caller via `frequency`).
 */
export function resolveRecipients(
    event: AudienceEvent,
    subscribers: AudienceSubscriber[],
    rules: RuleLike[],
    opts: { frequency?: ArticleFrequency } = {},
): bigint[] {
    const eventDisciplines = new Set(event.discipline_ids.map(String))
    const out: bigint[] = []

    for (const s of subscribers) {
        if (s.status !== "active") continue

        if (event.event_type === "issue_published" && !s.issue_alerts) continue
        if (event.event_type === "article_digest" && s.article_frequency !== (opts.frequency ?? "weekly")) continue

        const follows = event.journal_id !== null && s.journal_ids.some((j) => j === event.journal_id)
        const shared = s.discipline_ids.filter((d) => eventDisciplines.has(String(d)))
        if (!follows && shared.length === 0) continue

        // A follower is judged on all of the event's disciplines; a discipline
        // match only on the disciplines they actually share.
        const relevant = follows ? event.discipline_ids : shared
        if (!effectiveRule(rules, event.event_type, event.journal_id, relevant).enabled) continue

        out.push(s.id)
    }
    return out
}

export interface DigestEvent extends AudienceEvent {
    id: bigint
}

/** Per subscriber, the digest articles they should receive. Subscribers with none are omitted. */
export function resolveDigest(
    events: DigestEvent[],
    subscribers: AudienceSubscriber[],
    rules: RuleLike[],
    frequency: ArticleFrequency,
): Map<bigint, bigint[]> {
    const out = new Map<bigint, bigint[]>()
    for (const event of events) {
        for (const id of resolveRecipients(event, subscribers, rules, { frequency })) {
            const list = out.get(id)
            if (list) list.push(event.id)
            else out.set(id, [event.id])
        }
    }
    return out
}
