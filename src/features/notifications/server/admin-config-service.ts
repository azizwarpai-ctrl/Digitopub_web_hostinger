/**
 * Admin configuration for notifications (#202): editable settings, scoped
 * rules (global / journal / discipline), the discipline taxonomy and its
 * journal and OJS-section mappings.
 */

import { Prisma } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import { notificationFromAddress } from "@/src/lib/email/notification-transport"

import { ruleScopeKey, type RuleEventType, type RuleScope } from "../constants"
import { getSendLimits } from "./config"
import { DEFAULT_EMAIL_STYLE, getEmailStyle, type EmailStyle, type EmailStyleKey } from "./email-styles"

// ─── Settings ─────────────────────────────────────────────────────────

export const SETTINGS_KEY = "notify_settings"

export interface NotificationSettings {
    /** Postal address shown in every footer (CAN-SPAM). */
    publisher_address: string
    /** UTC weekday the weekly digest is drafted on (0 = Sunday … 6 = Saturday). */
    weekly_digest_day: number
    /** Recorded on new public sign-ups; bump when the consent wording changes. */
    consent_text_version: string
    /** Design of every notification email (style gallery). */
    email_style: EmailStyleKey
}

export const DEFAULT_SETTINGS: NotificationSettings = {
    publisher_address: "",
    weekly_digest_day: 1,
    consent_text_version: "public-form-v1",
    email_style: DEFAULT_EMAIL_STYLE,
}

export async function getSettings(): Promise<NotificationSettings> {
    const row = await prisma.systemSetting.findUnique({ where: { setting_key: SETTINGS_KEY }, select: { setting_value: true } })
    const stored = row?.setting_value && typeof row.setting_value === "object" ? (row.setting_value as Partial<NotificationSettings>) : {}
    const merged = { ...DEFAULT_SETTINGS, ...stored }
    return { ...merged, email_style: getEmailStyle(merged.email_style).key }
}

/** The style every notification email is currently drawn in. */
export async function getActiveEmailStyle(): Promise<EmailStyle> {
    return getEmailStyle((await getSettings()).email_style)
}

export async function saveSettings(input: Partial<NotificationSettings>, adminId: bigint): Promise<NotificationSettings> {
    const next = { ...(await getSettings()), ...input }
    await prisma.systemSetting.upsert({
        where: { setting_key: SETTINGS_KEY },
        update: { setting_value: next as unknown as Prisma.InputJsonValue, updated_by: adminId },
        create: {
            setting_key: SETTINGS_KEY,
            setting_value: next as unknown as Prisma.InputJsonValue,
            description: "Publication notification settings",
            updated_by: adminId,
        },
    })
    return next
}

/** Settings plus the read-only, env-driven values the settings page displays. */
export async function getSettingsView() {
    return {
        settings: await getSettings(),
        readonly: {
            from: notificationFromAddress(),
            limits: getSendLimits(),
            enabled: process.env.NOTIFICATIONS_ENABLED === "true",
            schedule: { detect: "*/30 * * * *", digests: "0 7 * * * (UTC)", send: "*/5 * * * *" },
        },
    }
}

// ─── Rules ────────────────────────────────────────────────────────────

export async function listRules() {
    const rules = await prisma.notificationRule.findMany({
        orderBy: [{ scope: "asc" }, { id: "asc" }],
        include: {
            journal: { select: { title: true } },
            discipline: { select: { name: true } },
            template: { select: { name: true } },
        },
    })
    return rules.map(({ journal, discipline, template, ...r }) => ({
        ...r,
        target_name: journal?.title ?? discipline?.name ?? null,
        template_name: template?.name ?? null,
    }))
}

export interface RuleInput {
    scope: RuleScope
    journal_id?: string | null
    discipline_id?: string | null
    event_type: RuleEventType
    enabled: boolean
    auto_draft: boolean
    template_id?: string | null
}

export class RuleInputError extends Error {}

/** Upserts the one rule for (scope target, event type). */
export async function upsertRule(input: RuleInput, adminId: bigint) {
    const journalId = input.scope === "journal" ? input.journal_id : null
    const disciplineId = input.scope === "discipline" ? input.discipline_id : null
    if (input.scope === "journal" && !journalId) throw new RuleInputError("A journal rule needs journal_id.")
    if (input.scope === "discipline" && !disciplineId) throw new RuleInputError("A discipline rule needs discipline_id.")
    if (input.template_id) {
        const t = await prisma.emailTemplate.findUnique({ where: { id: BigInt(input.template_id) }, select: { category: true } })
        if (t?.category !== "notification") throw new RuleInputError("Template overrides must be notification templates.")
    }

    const scopeKey = ruleScopeKey(input.scope, journalId ?? disciplineId)
    const data = {
        enabled: input.enabled,
        auto_draft: input.auto_draft,
        template_id: input.template_id ? BigInt(input.template_id) : null,
        updated_by: adminId,
    }
    return prisma.notificationRule.upsert({
        where: { scope_key_event_type: { scope_key: scopeKey, event_type: input.event_type } },
        update: data,
        create: {
            ...data,
            scope: input.scope,
            scope_key: scopeKey,
            event_type: input.event_type,
            journal_id: journalId ? BigInt(journalId) : null,
            discipline_id: disciplineId ? BigInt(disciplineId) : null,
        },
    })
}

/** Override rows can be removed (falling back to the next scope); global rules cannot. */
export async function deleteRule(id: bigint): Promise<"deleted" | "not_found" | "global"> {
    const rule = await prisma.notificationRule.findUnique({ where: { id }, select: { scope: true } })
    if (!rule) return "not_found"
    if (rule.scope === "global") return "global"
    await prisma.notificationRule.delete({ where: { id } })
    return "deleted"
}

// ─── Disciplines & mappings ───────────────────────────────────────────

export function slugify(name: string): string {
    return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100)
}

const cleanSynonyms = (list: string[]) =>
    [...new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 200)

export class DisciplineInputError extends Error {}

export async function listAllDisciplines() {
    return prisma.discipline.findMany({
        orderBy: [{ parent_id: "asc" }, { sort_order: "asc" }, { name: "asc" }],
        include: { _count: { select: { subscribers: true, journals: true } } },
    })
}

export async function createDiscipline(input: { name: string; slug?: string; parent_id?: string | null; synonyms?: string[] }) {
    const slug = input.slug ? slugify(input.slug) : slugify(input.name)
    if (!slug) throw new DisciplineInputError("The name must contain letters or digits.")
    try {
        return await prisma.discipline.create({
            data: {
                slug,
                name: input.name.trim(),
                parent_id: input.parent_id ? BigInt(input.parent_id) : null,
                synonyms: cleanSynonyms(input.synonyms ?? []),
            },
        })
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DisciplineInputError(`The slug "${slug}" is already used.`)
        throw e
    }
}

export async function updateDiscipline(
    id: bigint,
    input: { name?: string; parent_id?: string | null; synonyms?: string[]; is_active?: boolean; sort_order?: number },
) {
    if (input.parent_id && BigInt(input.parent_id) === id) throw new DisciplineInputError("A discipline cannot be its own parent.")
    if (input.parent_id) {
        // Walk up from the new parent: reaching `id` would create a cycle.
        let cursor: bigint | null = BigInt(input.parent_id)
        for (let depth = 0; cursor !== null && depth < 50; depth++) {
            if (cursor === id) throw new DisciplineInputError("That parent would create a cycle.")
            const row: { parent_id: bigint | null } | null = await prisma.discipline.findUnique({ where: { id: cursor }, select: { parent_id: true } })
            cursor = row?.parent_id ?? null
        }
    }
    const exists = await prisma.discipline.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return null
    return prisma.discipline.update({
        where: { id },
        data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.parent_id !== undefined ? { parent_id: input.parent_id ? BigInt(input.parent_id) : null } : {}),
            ...(input.synonyms !== undefined ? { synonyms: cleanSynonyms(input.synonyms) } : {}),
            ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
            ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
        },
    })
}

export async function listJournalMappings() {
    const journals = await prisma.journal.findMany({
        where: { status: "active" },
        orderBy: { title: "asc" },
        select: { id: true, title: true, ojs_id: true, disciplines: { select: { discipline_id: true } } },
    })
    return journals.map(({ disciplines, ...j }) => ({ ...j, discipline_ids: disciplines.map((d) => d.discipline_id) }))
}

export async function setJournalDisciplines(journalId: bigint, disciplineIds: string[]) {
    await prisma.$transaction([
        prisma.journalDiscipline.deleteMany({ where: { journal_id: journalId } }),
        prisma.journalDiscipline.createMany({
            data: [...new Set(disciplineIds)].map((d) => ({ journal_id: journalId, discipline_id: BigInt(d) })),
            skipDuplicates: true,
        }),
    ])
}

export async function listSectionMappings() {
    const rows = await prisma.ojsSectionDiscipline.findMany({ orderBy: { ojs_section_id: "asc" } })
    const map = new Map<string, bigint[]>()
    for (const r of rows) map.set(String(r.ojs_section_id), [...(map.get(String(r.ojs_section_id)) ?? []), r.discipline_id])
    return [...map.entries()].map(([ojs_section_id, discipline_ids]) => ({ ojs_section_id, discipline_ids }))
}

export async function setSectionDisciplines(sectionId: bigint, disciplineIds: string[]) {
    await prisma.$transaction([
        prisma.ojsSectionDiscipline.deleteMany({ where: { ojs_section_id: sectionId } }),
        prisma.ojsSectionDiscipline.createMany({
            data: [...new Set(disciplineIds)].map((d) => ({ ojs_section_id: sectionId, discipline_id: BigInt(d) })),
            skipDuplicates: true,
        }),
    ])
}
