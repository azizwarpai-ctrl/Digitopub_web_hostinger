import { Prisma } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import { emailHash } from "@/src/lib/email-hash"

import { CONSENT_VERSIONS, getImportMaxRows } from "./config"
import { ensureNotificationTemplate, NOTIFICATION_TEMPLATE_KEYS } from "./templates"
import { parseImportFile, toCandidates, type ColumnMap, type ParsedSheet } from "./import/parse"
import { buildDisciplineIndex, mapInterests, normalizeTerm, synonymsOf } from "./import/map-interests"
import { computeTotals, stageCandidates, type ImportTotals } from "./import/stage"

/** Prisma batch size for createMany / IN (...) lookups. */
const CHUNK = 500

export class ImportStateError extends Error {}

function chunks<T>(items: T[], size = CHUNK): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

async function loadDisciplineIndex() {
    const disciplines = await prisma.discipline.findMany({
        select: { id: true, name: true, synonyms: true, is_active: true },
    })
    return buildDisciplineIndex(disciplines)
}

async function existingStatuses(emails: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const unique = [...new Set(emails.filter(Boolean))]
    for (const part of chunks(unique)) {
        const rows = await prisma.notificationSubscriber.findMany({
            where: { email: { in: part } },
            select: { email: true, status: true },
        })
        for (const r of rows) map.set(r.email, r.status)
    }
    return map
}

/** Stateless preview for the "Map columns" wizard step. Nothing is stored. */
export function inspectImportFile(buffer: Uint8Array, fileName: string) {
    const sheet = parseImportFile(buffer, fileName, getImportMaxRows())
    return {
        file_type: sheet.fileType,
        headers: sheet.headers,
        has_header_row: sheet.hasHeaderRow,
        detected_column_map: sheet.detected,
        row_count: sheet.rows.length,
        sample_rows: sheet.rows.slice(0, 5),
    }
}

/** Parse, classify and stage an upload as a new `parsed` import. */
export async function createImport(input: {
    buffer: Uint8Array
    fileName: string
    columnMap?: ColumnMap
    uploadedBy: bigint
}) {
    const sheet: ParsedSheet = parseImportFile(input.buffer, input.fileName, getImportMaxRows())
    const columnMap = input.columnMap ?? sheet.detected
    if (!columnMap) {
        throw new ImportStateError("No email column was found. Choose the email column and upload again.")
    }
    const width = sheet.headers.length
    for (const [key, idx] of Object.entries(columnMap)) {
        if (idx !== undefined && idx >= width) throw new ImportStateError(`Column map "${key}" points past the last column.`)
    }

    const candidates = toCandidates(sheet, columnMap)
    const [existing, index] = await Promise.all([
        existingStatuses(candidates.map((c) => c.email)),
        loadDisciplineIndex(),
    ])
    const { rows, totals } = stageCandidates(candidates, existing, index)

    const created = await prisma.subscriberImport.create({
        data: {
            file_name: input.fileName.slice(0, 255),
            file_type: sheet.fileType,
            uploaded_by: input.uploadedBy,
            status: "parsed",
            totals: totals as unknown as Prisma.InputJsonValue,
            column_map: columnMap as unknown as Prisma.InputJsonValue,
        },
    })
    for (const part of chunks(rows)) {
        await prisma.subscriberImportRow.createMany({
            data: part.map((r) => ({
                import_id: created.id,
                row_no: r.row_no,
                email: r.email?.slice(0, 255) ?? null,
                name: r.name?.slice(0, 255) ?? null,
                raw_interests: r.raw_interests,
                mapped_discipline_ids: r.mapped_discipline_ids,
                unmapped_terms: r.unmapped_terms,
                issue: r.issue,
            })),
        })
    }
    return { ...created, unmapped_terms: await unmappedTermSummary(created.id) }
}

/** Distinct unmapped terms over valid rows, most frequent first. */
export async function unmappedTermSummary(importId: bigint): Promise<Array<{ term: string; count: number }>> {
    const rows = await prisma.subscriberImportRow.findMany({
        where: { import_id: importId, issue: null },
        select: { unmapped_terms: true },
    })
    const counts = new Map<string, number>()
    for (const r of rows) {
        for (const t of synonymsOf(r.unmapped_terms)) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()]
        .map(([term, count]) => ({ term, count }))
        .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
}

async function requireParsedImport(id: bigint) {
    const imp = await prisma.subscriberImport.findUnique({ where: { id } })
    if (!imp) return null
    if (imp.status !== "parsed") throw new ImportStateError(`This import is already ${imp.status}.`)
    return imp
}

/**
 * Saves each term as a synonym of the chosen discipline (so later imports
 * match it automatically), then re-maps this import's staging rows.
 */
export async function applyTermMappings(importId: bigint, mappings: Array<{ term: string; discipline_id: string }>) {
    const imp = await requireParsedImport(importId)
    if (!imp) return null

    const byDiscipline = new Map<string, Set<string>>()
    for (const m of mappings) {
        const term = normalizeTerm(m.term)
        if (!term) continue
        if (!byDiscipline.has(m.discipline_id)) byDiscipline.set(m.discipline_id, new Set())
        byDiscipline.get(m.discipline_id)!.add(term)
    }
    const disciplineIds = [...byDiscipline.keys()].map((id) => BigInt(id))
    const disciplines = await prisma.discipline.findMany({ where: { id: { in: disciplineIds } } })
    if (disciplines.length !== disciplineIds.length) throw new ImportStateError("Unknown discipline in mappings.")

    for (const d of disciplines) {
        const current = synonymsOf(d.synonyms)
        const known = new Set(current.map(normalizeTerm))
        const additions = [...byDiscipline.get(String(d.id))!].filter((t) => !known.has(t))
        if (additions.length) {
            await prisma.discipline.update({ where: { id: d.id }, data: { synonyms: [...current, ...additions] } })
        }
    }

    const index = await loadDisciplineIndex()
    const rows = await prisma.subscriberImportRow.findMany({
        where: { import_id: importId },
        select: { id: true, raw_interests: true, issue: true, mapped_discipline_ids: true, unmapped_terms: true },
    })
    const remapped = rows.map((r) => ({ ...r, ...mapInterests(r.raw_interests, index) }))
    for (const r of remapped) {
        const before = JSON.stringify([r.mapped_discipline_ids, r.unmapped_terms])
        if (before !== JSON.stringify([r.discipline_ids, r.unmapped])) {
            await prisma.subscriberImportRow.update({
                where: { id: r.id },
                data: { mapped_discipline_ids: r.discipline_ids, unmapped_terms: r.unmapped },
            })
        }
    }
    const totals = computeTotals(remapped.map((r) => ({ issue: r.issue as never, unmapped_terms: r.unmapped })))
    const updated = await prisma.subscriberImport.update({
        where: { id: importId },
        data: { totals: totals as unknown as Prisma.InputJsonValue },
    })
    return { ...updated, unmapped_terms: await unmappedTermSummary(importId) }
}

/**
 * Creates `pending` subscribers for every valid row and one draft invitation
 * campaign. Sends nothing. Existing subscribers (including suppressed ones)
 * are never modified: the insert skips any email that already exists.
 */
export async function confirmImport(importId: bigint) {
    // Claim the import atomically so a double-click cannot confirm twice.
    const claimed = await prisma.subscriberImport.updateMany({
        where: { id: importId, status: "parsed" },
        data: { status: "confirmed" },
    })
    if (claimed.count === 0) {
        const imp = await prisma.subscriberImport.findUnique({ where: { id: importId }, select: { status: true } })
        if (!imp) return null
        throw new ImportStateError(`This import is already ${imp.status}.`)
    }

    try {
        const rows = await prisma.subscriberImportRow.findMany({
            where: { import_id: importId, issue: null },
            select: { email: true, name: true, raw_interests: true, mapped_discipline_ids: true },
            orderBy: { row_no: "asc" },
        })
        const valid = rows.filter((r): r is typeof r & { email: string } => !!r.email)

        let created = 0
        for (const part of chunks(valid)) {
            const res = await prisma.notificationSubscriber.createMany({
                data: part.map((r) => ({
                    email: r.email,
                    email_hash: emailHash(r.email)!,
                    name: r.name,
                    raw_interests: r.raw_interests,
                    status: "pending",
                    source: "import",
                    import_id: importId,
                    consent_text_version: CONSENT_VERSIONS.import,
                })),
                skipDuplicates: true,
            })
            created += res.count

            // Interests only for subscribers this import actually created.
            const subs = await prisma.notificationSubscriber.findMany({
                where: { email: { in: part.map((r) => r.email) }, import_id: importId },
                select: { id: true, email: true },
            })
            const idByEmail = new Map(subs.map((s) => [s.email, s.id]))
            const links = part.flatMap((r) => {
                const sid = idByEmail.get(r.email)
                return sid ? synonymsOf(r.mapped_discipline_ids).map((d) => ({ subscriber_id: sid, discipline_id: BigInt(d) })) : []
            })
            if (links.length) await prisma.subscriberDiscipline.createMany({ data: links, skipDuplicates: true })
        }

        const templateId = await ensureNotificationTemplate(prisma, NOTIFICATION_TEMPLATE_KEYS.importInvitation)
        const campaign = await prisma.notificationCampaign.create({
            data: {
                type: "invitation",
                status: "draft",
                template_id: templateId,
                payload: { import_id: importId.toString() },
                recipient_estimate: created,
            },
        })

        const imp = await prisma.subscriberImport.findUniqueOrThrow({ where: { id: importId } })
        const totals = { ...(imp.totals as unknown as ImportTotals), created }
        const updated = await prisma.subscriberImport.update({
            where: { id: importId },
            data: { totals: totals as unknown as Prisma.InputJsonValue },
        })
        return { import: updated, campaign, created }
    } catch (e) {
        await prisma.subscriberImport.update({ where: { id: importId }, data: { status: "failed" } }).catch(() => {})
        throw e
    }
}

export async function cancelImport(importId: bigint) {
    const imp = await requireParsedImport(importId)
    if (!imp) return null
    await prisma.subscriberImportRow.deleteMany({ where: { import_id: importId } })
    return prisma.subscriberImport.update({ where: { id: importId }, data: { status: "cancelled" } })
}

export async function listImports(offset: number, limit: number) {
    const [rows, total] = await Promise.all([
        prisma.subscriberImport.findMany({
            orderBy: { created_at: "desc" },
            skip: offset,
            take: limit,
            include: { uploader: { select: { id: true, full_name: true, email: true } } },
        }),
        prisma.subscriberImport.count(),
    ])
    return { rows, total }
}

export async function getImport(importId: bigint) {
    const imp = await prisma.subscriberImport.findUnique({
        where: { id: importId },
        include: { uploader: { select: { id: true, full_name: true, email: true } } },
    })
    if (!imp) return null
    return { ...imp, unmapped_terms: await unmappedTermSummary(importId) }
}

export async function listImportRows(
    importId: bigint,
    filter: "valid" | "unmapped" | "invalid_email" | "duplicate_in_file" | "exists" | "suppressed" | undefined,
    offset: number,
    limit: number,
) {
    const where: Prisma.SubscriberImportRowWhereInput = { import_id: importId }
    if (filter === "valid") where.issue = null
    else if (filter === "unmapped") {
        where.issue = null
        where.NOT = { unmapped_terms: { equals: [] } }
    } else if (filter) where.issue = filter

    const [rows, total] = await Promise.all([
        prisma.subscriberImportRow.findMany({ where, orderBy: { row_no: "asc" }, skip: offset, take: limit }),
        prisma.subscriberImportRow.count({ where }),
    ])
    return { rows, total }
}
