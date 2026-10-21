import { Prisma } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import { emailHash } from "@/src/lib/email-hash"
import { rowsToCsv, type CsvColumn } from "@/components/data-table/csv-export"

import { CONSENT_VERSIONS } from "./config"
import type {
    SubscriberCreateInput,
    SubscriberListQuery,
    SubscriberUpdateInput,
} from "../schemas/notification-schemas"

export class SubscriberConflictError extends Error {}

const EXPORT_LIMIT = 50_000

const subscriberInclude = {
    disciplines: { select: { discipline: { select: { id: true, name: true, slug: true } } } },
    journals: { select: { journal: { select: { id: true, title: true } } } },
} satisfies Prisma.NotificationSubscriberInclude

type SubscriberWithRelations = Prisma.NotificationSubscriberGetPayload<{ include: typeof subscriberInclude }>

/** Flattens the join tables into `disciplines` / `journals` arrays. */
function shape(s: SubscriberWithRelations) {
    const { disciplines, journals, confirm_token_hash: _token, consent_ip_hash: _ip, ...rest } = s
    return {
        ...rest,
        disciplines: disciplines.map((d) => d.discipline),
        journals: journals.map((j) => j.journal),
    }
}

function buildWhere(q: SubscriberListQuery): Prisma.NotificationSubscriberWhereInput {
    const where: Prisma.NotificationSubscriberWhereInput = {}
    if (q.status) where.status = q.status
    if (q.source) where.source = q.source
    if (q.discipline_id) where.disciplines = { some: { discipline_id: BigInt(q.discipline_id) } }
    if (q.journal_id) where.journals = { some: { journal_id: BigInt(q.journal_id) } }
    if (q.q) where.OR = [{ email: { contains: q.q.toLowerCase() } }, { name: { contains: q.q } }]
    return where
}

export async function listSubscribers(q: SubscriberListQuery, offset: number, limit: number) {
    const where = buildWhere(q)
    const [rows, total] = await Promise.all([
        prisma.notificationSubscriber.findMany({
            where,
            include: subscriberInclude,
            orderBy: { created_at: "desc" },
            skip: offset,
            take: limit,
        }),
        prisma.notificationSubscriber.count({ where }),
    ])
    return { rows: rows.map(shape), total }
}

export async function getSubscriber(id: bigint) {
    const s = await prisma.notificationSubscriber.findUnique({ where: { id }, include: subscriberInclude })
    return s ? shape(s) : null
}

/** Manual add. Always `pending`: the person must still confirm by email. */
export async function createSubscriber(input: SubscriberCreateInput) {
    const email = input.email.trim().toLowerCase()
    try {
        const s = await prisma.notificationSubscriber.create({
            data: {
                email,
                email_hash: emailHash(email)!,
                name: input.name || null,
                affiliation: input.affiliation || null,
                status: "pending",
                source: "admin_manual",
                consent_text_version: CONSENT_VERSIONS.admin_manual,
                disciplines: input.discipline_ids?.length
                    ? { create: input.discipline_ids.map((id) => ({ discipline_id: BigInt(id) })) }
                    : undefined,
                journals: input.journal_ids?.length
                    ? { create: input.journal_ids.map((id) => ({ journal_id: BigInt(id) })) }
                    : undefined,
            },
            include: subscriberInclude,
        })
        return shape(s)
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            throw new SubscriberConflictError("A subscriber with this email already exists.")
        }
        throw e
    }
}

export async function updateSubscriber(id: bigint, input: SubscriberUpdateInput) {
    const existing = await prisma.notificationSubscriber.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!existing) return null

    const data: Prisma.NotificationSubscriberUpdateInput = {}
    if (input.name !== undefined) data.name = input.name || null
    if (input.affiliation !== undefined) data.affiliation = input.affiliation || null
    if (input.article_frequency !== undefined) data.article_frequency = input.article_frequency
    if (input.issue_alerts !== undefined) data.issue_alerts = input.issue_alerts
    if (input.status !== undefined && input.status !== existing.status) {
        data.status = input.status
        if (input.status === "unsubscribed") data.unsubscribed_at = new Date()
    }
    if (input.discipline_ids !== undefined) {
        data.disciplines = {
            deleteMany: {},
            create: input.discipline_ids.map((d) => ({ discipline_id: BigInt(d) })),
        }
    }
    if (input.journal_ids !== undefined) {
        data.journals = {
            deleteMany: {},
            create: input.journal_ids.map((j) => ({ journal_id: BigInt(j) })),
        }
    }
    const s = await prisma.notificationSubscriber.update({ where: { id }, data, include: subscriberInclude })
    return shape(s)
}

export async function deleteSubscriber(id: bigint): Promise<boolean> {
    const res = await prisma.notificationSubscriber.deleteMany({ where: { id } })
    return res.count > 0
}

type ShapedSubscriber = ReturnType<typeof shape>

const EXPORT_COLUMNS: CsvColumn<ShapedSubscriber>[] = [
    { header: "email", accessor: (s) => s.email },
    { header: "name", accessor: (s) => s.name },
    { header: "affiliation", accessor: (s) => s.affiliation },
    { header: "status", accessor: (s) => s.status },
    { header: "source", accessor: (s) => s.source },
    { header: "article_frequency", accessor: (s) => s.article_frequency },
    { header: "issue_alerts", accessor: (s) => (s.issue_alerts ? "yes" : "no") },
    { header: "disciplines", accessor: (s) => s.disciplines.map((d) => d.name).join("; ") },
    { header: "journals", accessor: (s) => s.journals.map((j) => j.title).join("; ") },
    { header: "confirmed_at", accessor: (s) => s.confirmed_at?.toISOString() ?? "" },
    { header: "created_at", accessor: (s) => s.created_at.toISOString() },
]

/** CSV of the filtered list (formula-injection safe via `rowsToCsv`). */
export async function exportSubscribersCsv(q: SubscriberListQuery): Promise<string> {
    const rows = await prisma.notificationSubscriber.findMany({
        where: buildWhere(q),
        include: subscriberInclude,
        orderBy: { created_at: "desc" },
        take: EXPORT_LIMIT,
    })
    return rowsToCsv(rows.map(shape), EXPORT_COLUMNS)
}
