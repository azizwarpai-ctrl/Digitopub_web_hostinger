import { prisma } from "@/src/lib/db/config"

import type { AudienceSubscriber, RuleLike } from "./resolve-recipients"

/** All notification rules, for `effectiveRule` / `resolveRecipients`. */
export async function loadRules(): Promise<RuleLike[]> {
    return prisma.notificationRule.findMany({
        select: { scope: true, journal_id: true, discipline_id: true, event_type: true, enabled: true, auto_draft: true, template_id: true },
    })
}

/** Active subscribers with their follows and disciplines. Only active rows can ever receive alerts. */
export async function loadActiveAudience(): Promise<AudienceSubscriber[]> {
    const rows = await prisma.notificationSubscriber.findMany({
        where: { status: "active" },
        select: {
            id: true,
            status: true,
            issue_alerts: true,
            article_frequency: true,
            journals: { select: { journal_id: true } },
            disciplines: { select: { discipline_id: true } },
        },
    })
    return rows.map((r) => ({
        id: r.id,
        status: r.status,
        issue_alerts: r.issue_alerts,
        article_frequency: r.article_frequency,
        journal_ids: r.journals.map((j) => j.journal_id),
        discipline_ids: r.disciplines.map((d) => d.discipline_id),
    }))
}
