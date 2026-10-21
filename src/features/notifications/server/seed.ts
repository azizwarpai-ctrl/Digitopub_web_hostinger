import type { PrismaClient } from "@prisma/client"

import { RULE_EVENT_TYPES, ruleScopeKey } from "../constants"
import { DISCIPLINE_SEED, type DisciplineSeed } from "./seed-data"

type SeedDb = Pick<PrismaClient, "discipline" | "notificationRule">

export interface NotificationSeedResult {
    disciplines: number
    rules: number
}

/**
 * Seeds the starter discipline tree and one enabled global rule per event
 * type. Idempotent: rows are matched by `slug` / `(scope_key, event_type)` and
 * existing rows are left untouched, so admin edits survive re-runs.
 */
export async function seedNotificationDefaults(
    db: SeedDb,
    tree: DisciplineSeed[] = DISCIPLINE_SEED,
): Promise<NotificationSeedResult> {
    let disciplines = 0

    const upsertLevel = async (nodes: DisciplineSeed[], parentId: bigint | null) => {
        for (const [index, node] of nodes.entries()) {
            const row = await db.discipline.upsert({
                where: { slug: node.slug },
                update: {},
                create: {
                    slug: node.slug,
                    name: node.name,
                    synonyms: node.synonyms,
                    parent_id: parentId,
                    sort_order: index,
                },
            })
            disciplines++
            if (node.children?.length) await upsertLevel(node.children, row.id)
        }
    }
    await upsertLevel(tree, null)

    let rules = 0
    for (const eventType of RULE_EVENT_TYPES) {
        await db.notificationRule.upsert({
            where: { scope_key_event_type: { scope_key: ruleScopeKey("global"), event_type: eventType } },
            update: {},
            create: {
                scope: "global",
                scope_key: ruleScopeKey("global"),
                event_type: eventType,
                enabled: true,
                auto_draft: true,
            },
        })
        rules++
    }

    return { disciplines, rules }
}
