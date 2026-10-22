import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"

import { seedNotificationDefaults } from "@/src/features/notifications/server/seed"
import { DISCIPLINE_SEED, type DisciplineSeed } from "@/src/features/notifications/server/seed-data"
import { publicationDedupeKey, ruleScopeKey } from "@/src/features/notifications/constants"

type Row = Record<string, unknown> & { id: bigint }

/** Minimal in-memory stand-in for the two Prisma delegates the seed uses. */
function fakeDb() {
    const disciplines = new Map<string, Row>()
    const rules = new Map<string, Row>()
    let nextId = 1n
    const db = {
        discipline: {
            upsert: async ({ where, create }: { where: { slug: string }; create: Record<string, unknown> }) => {
                const existing = disciplines.get(where.slug)
                if (existing) return existing
                const row = { id: nextId++, ...create }
                disciplines.set(where.slug, row)
                return row
            },
        },
        notificationRule: {
            upsert: async ({ where, create }: {
                where: { scope_key_event_type: { scope_key: string; event_type: string } }
                create: Record<string, unknown>
            }) => {
                const key = `${where.scope_key_event_type.scope_key}|${where.scope_key_event_type.event_type}`
                const existing = rules.get(key)
                if (existing) return existing
                const row = { id: nextId++, ...create }
                rules.set(key, row)
                return row
            },
        },
    }
    return { db, disciplines, rules }
}

const countNodes = (nodes: DisciplineSeed[]): number =>
    nodes.reduce((n, d) => n + 1 + countNodes(d.children ?? []), 0)

describe("seedNotificationDefaults", () => {
    it("is idempotent: a second run leaves row counts unchanged", async () => {
        const { db, disciplines, rules } = fakeDb()
        await seedNotificationDefaults(db as any)
        const first = { d: disciplines.size, r: rules.size }
        await seedNotificationDefaults(db as any)

        expect(first.d).toBe(countNodes(DISCIPLINE_SEED))
        expect(first.r).toBe(2)
        expect(disciplines.size).toBe(first.d)
        expect(rules.size).toBe(first.r)
    })

    it("links children to their parent and creates enabled global rules", async () => {
        const { db, disciplines, rules } = fakeDb()
        await seedNotificationDefaults(db as any)

        const dentistry = disciplines.get("dentistry")!
        expect(dentistry.parent_id).toBeNull()
        expect(disciplines.get("orthodontics")!.parent_id).toBe(dentistry.id)

        for (const rule of rules.values()) {
            expect(rule).toMatchObject({ scope: "global", scope_key: "global", enabled: true, auto_draft: true })
        }
        expect([...rules.values()].map((r) => r.event_type).sort()).toEqual(["article_digest", "issue_published"])
    })

    it("does not overwrite rows an admin has already edited", async () => {
        const { db, disciplines } = fakeDb()
        disciplines.set("orthodontics", { id: 99n, slug: "orthodontics", name: "Ortho (renamed)", synonyms: [] })
        await seedNotificationDefaults(db as any)
        expect(disciplines.get("orthodontics")!.name).toBe("Ortho (renamed)")
    })
})

describe("seed data", () => {
    it("has unique slugs and lowercase synonyms", () => {
        const all: DisciplineSeed[] = []
        const walk = (nodes: DisciplineSeed[]) => nodes.forEach((n) => { all.push(n); walk(n.children ?? []) })
        walk(DISCIPLINE_SEED)

        const slugs = all.map((d) => d.slug)
        expect(new Set(slugs).size).toBe(slugs.length)
        for (const d of all) {
            expect(d.slug).toMatch(/^[a-z0-9-]+$/)
            expect(d.synonyms.length).toBeGreaterThan(0)
            for (const s of d.synonyms) expect(s).toBe(s.toLowerCase())
        }
    })
})

describe("key helpers", () => {
    it("builds scope and dedupe keys", () => {
        expect(ruleScopeKey("global")).toBe("global")
        expect(ruleScopeKey("journal", 12n)).toBe("journal:12")
        expect(() => ruleScopeKey("discipline")).toThrow()
        expect(publicationDedupeKey("article", 345)).toBe("article:345")
    })
})

describe("notifications_foundation migration", () => {
    const sql = readFileSync(
        join(process.cwd(), "prisma/migrations/20261021120000_notifications_foundation/migration.sql"),
        "utf8",
    )

    it("is additive only", () => {
        expect(sql).not.toMatch(/\bDROP\b/i)
        expect(sql).not.toMatch(/\bMODIFY\b|\bCHANGE\s+COLUMN\b|\bRENAME\b/i)
        expect(sql).not.toMatch(/\b(UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+`/i)
    })

    it("defaults existing email templates to the transactional category", () => {
        expect(sql).toContain("ALTER TABLE `email_templates` ADD COLUMN `category` VARCHAR(30) NOT NULL DEFAULT 'transactional'")
    })

    it("creates the required indexes", () => {
        for (const idx of [
            "notification_subscribers_status_idx",
            "notification_subscribers_email_hash_idx",
            "notification_subscribers_orcid_idx",
            "notification_deliveries_campaign_id_status_idx",
            "notification_deliveries_sent_at_idx",
            "publication_events_published_at_idx",
        ]) {
            expect(sql).toContain(idx)
        }
    })

    it("cascades subscriber deletes to interests, follows and deliveries", () => {
        for (const fk of [
            "subscriber_disciplines_subscriber_id_fkey",
            "subscriber_journals_subscriber_id_fkey",
            "notification_deliveries_subscriber_id_fkey",
        ]) {
            expect(sql).toMatch(new RegExp(`${fk}\` FOREIGN KEY \\(\`subscriber_id\`\\) REFERENCES \`notification_subscribers\`\\(\`id\`\\) ON DELETE CASCADE`))
        }
    })
})
