/**
 * Detects newly published OJS issues and articles (#200) and records each
 * once in the `publication_events` ledger, then drafts issue campaigns.
 * Nothing is sent here: drafts wait for an admin (#202).
 *
 * Watermark: the OJS server's own NOW() at the start of the previous run,
 * stored in system_settings, so both sides of the comparison use the OJS
 * clock. `publications.date_published` is a DATE, so candidates are selected
 * by `last_modified >= watermark` and a date floor one day before it; the
 * ledger's unique `dedupe_key` absorbs the overlap. A run that hits the
 * per-run cap advances only to the last candidate it processed. On the first
 * run the watermark is only initialised: the back catalogue is never announced.
 */

import { Prisma } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import { ojsQuery } from "@/src/features/ojs/server/ojs-client"
import { fetchIssueWithArticles } from "@/src/features/journals/server/archive-issue-service"
import { fetchArticlesWithAuthors } from "@/src/features/journals/server/ojs-article-utils"
import type { CurrentIssueArticle } from "@/src/features/journals"

import { publicationDedupeKey } from "../constants"
import type { ArticleSnapshot, CampaignPayload, IssueSnapshot } from "../types/notification-types"
import { buildDisciplineIndex, matchTerm } from "./import/map-interests"
import { getAppBaseUrl } from "./config"
import { loadActiveAudience, loadRules } from "./audience"
import { effectiveRule, resolveRecipients } from "./resolve-recipients"
import { NOTIFICATION_TEMPLATE_KEYS, ensureNotificationTemplate } from "./templates"

export const DETECT_WATERMARK_KEY = "notify_detect_watermark"
/** Upper bound per list per run; a capped run resumes from the last candidate it processed. */
const MAX_CANDIDATES = 200
const ABSTRACT_EXCERPT_WORDS = 50

export interface DetectResult {
    initialised: boolean
    watermark: string | null
    issues: number
    articles: number
    drafts: number
    partial: boolean
}

interface JournalInfo {
    ojsId: string
    localId: bigint | null
    title: string
    issn: string | null
    primaryLocale: string
    urlPath: string
    disciplineIds: bigint[]
}

// ─── Snapshot helpers ─────────────────────────────────────────────────

export function excerpt(html: string | null | undefined, words = ABSTRACT_EXCERPT_WORDS): string {
    if (!html) return ""
    const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
    const parts = text.split(" ")
    return parts.length <= words ? text : `${parts.slice(0, words).join(" ")}…`
}

function authorName(a: { givenName: string | null; familyName: string | null }): string {
    return [a.givenName, a.familyName].filter(Boolean).join(" ").trim()
}

function articleSnapshot(a: CurrentIssueArticle, j: JournalInfo, issueId: number | null): ArticleSnapshot {
    return {
        title: a.title || "Untitled",
        authors: a.authors.map((x) => ({ name: authorName(x) })).filter((x) => x.name),
        doi: a.doi ?? null,
        abstract_excerpt: excerpt(a.abstract),
        keywords: a.keywords ?? [],
        section: a.sectionTitle,
        section_id: a.sectionId ?? null,
        is_open_access: a.isOpenAccess,
        journal_title: j.title,
        journal_id: j.localId?.toString() ?? null,
        issue_id: issueId,
        publication_id: a.publicationId,
        url: `${getAppBaseUrl()}/journals/${j.ojsId}/articles/${a.publicationId}`,
    }
}

// ─── Discipline resolution ────────────────────────────────────────────

interface DisciplineContext {
    index: ReturnType<typeof buildDisciplineIndex>
    sectionMap: Map<string, bigint[]>
}

async function loadDisciplineContext(): Promise<DisciplineContext> {
    const [disciplines, sections] = await Promise.all([
        prisma.discipline.findMany({ where: { is_active: true }, select: { id: true, name: true, synonyms: true } }),
        prisma.ojsSectionDiscipline.findMany(),
    ])
    const sectionMap = new Map<string, bigint[]>()
    for (const s of sections) {
        const key = String(s.ojs_section_id)
        sectionMap.set(key, [...(sectionMap.get(key) ?? []), s.discipline_id])
    }
    return { index: buildDisciplineIndex(disciplines), sectionMap }
}

/** Journal mapping ∪ section mapping ∪ keywords matched against discipline names and synonyms. */
export function resolveDisciplines(
    journalDisciplines: bigint[],
    sectionId: number | null,
    keywords: string[],
    ctx: DisciplineContext,
): bigint[] {
    const ids = new Set<string>(journalDisciplines.map(String))
    if (sectionId !== null) for (const d of ctx.sectionMap.get(String(sectionId)) ?? []) ids.add(String(d))
    for (const kw of keywords) {
        const hit = matchTerm(kw, ctx.index)
        if (hit) ids.add(hit)
    }
    return [...ids].map(BigInt)
}

// ─── OJS lookups ──────────────────────────────────────────────────────

const journalCache = new Map<string, JournalInfo>()

async function journalInfo(ojsJournalId: number): Promise<JournalInfo | null> {
    const key = String(ojsJournalId)
    const cached = journalCache.get(key)
    if (cached) return cached

    const [rows, local] = await Promise.all([
        ojsQuery<{ primary_locale: string; path: string; title: string | null }>(
            `SELECT j.primary_locale, j.path,
                    (SELECT js.setting_value FROM journal_settings js
                      WHERE js.journal_id = j.journal_id AND js.setting_name = 'name'
                      ORDER BY js.locale = j.primary_locale DESC LIMIT 1) AS title
               FROM journals j WHERE j.journal_id = ? LIMIT 1`,
            [ojsJournalId],
        ),
        prisma.journal.findFirst({
            where: { ojs_id: key },
            select: { id: true, title: true, issn: true, disciplines: { select: { discipline_id: true } } },
        }),
    ])
    const row = rows[0]
    if (!row) return null
    const info: JournalInfo = {
        ojsId: key,
        localId: local?.id ?? null,
        title: local?.title || row.title || "Journal",
        issn: local?.issn ?? null,
        primaryLocale: row.primary_locale || "en",
        urlPath: row.path,
        disciplineIds: local?.disciplines.map((d) => d.discipline_id) ?? [],
    }
    journalCache.set(key, info)
    return info
}

async function readWatermark(): Promise<string | null> {
    const row = await prisma.systemSetting.findUnique({ where: { setting_key: DETECT_WATERMARK_KEY }, select: { setting_value: true } })
    return typeof row?.setting_value === "string" && row.setting_value ? row.setting_value : null
}

async function writeWatermark(value: string): Promise<void> {
    await prisma.systemSetting.upsert({
        where: { setting_key: DETECT_WATERMARK_KEY },
        update: { setting_value: value },
        create: {
            setting_key: DETECT_WATERMARK_KEY,
            setting_value: value,
            description: "Publication notifications: OJS clock at the start of the last complete detection run",
        },
    })
}

/** Ledger insert; returns the new id, or null when the publication was already recorded. */
async function recordEvent(data: Prisma.PublicationEventUncheckedCreateInput): Promise<bigint | null> {
    try {
        const row = await prisma.publicationEvent.create({ data, select: { id: true } })
        return row.id
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null
        throw e
    }
}

// ─── Main entry ───────────────────────────────────────────────────────

export async function detectPublications(): Promise<DetectResult> {
    journalCache.clear()
    const [{ now }] = await ojsQuery<{ now: string }>("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS now")
    const watermark = await readWatermark()

    if (!watermark) {
        await writeWatermark(now)
        return { initialised: true, watermark: now, issues: 0, articles: 0, drafts: 0, partial: false }
    }

    const ctx = await loadDisciplineContext()
    const issueRows = await ojsQuery<{ issue_id: number; journal_id: number; date_published: Date | string; lm: string }>(
        `SELECT i.issue_id, i.journal_id, i.date_published, DATE_FORMAT(i.last_modified, '%Y-%m-%d %H:%i:%s') AS lm
           FROM issues i
          WHERE i.published = 1
            AND i.last_modified >= ?
            AND i.date_published >= DATE_SUB(DATE(?), INTERVAL 1 DAY)
          ORDER BY i.last_modified ASC, i.issue_id ASC
          LIMIT ${MAX_CANDIDATES + 1}`,
        [watermark, watermark],
    )
    const pubRows = await ojsQuery<{ publication_id: number; submission_id: number; issue_id: number | null; journal_id: number; date_published: Date | string; lm: string }>(
        `SELECT p.publication_id, p.submission_id, p.issue_id, s.context_id AS journal_id, p.date_published,
                DATE_FORMAT(p.last_modified, '%Y-%m-%d %H:%i:%s') AS lm
           FROM publications p
           JOIN submissions s ON s.submission_id = p.submission_id
          WHERE p.status = 3 AND s.status = 3
            AND p.last_modified >= ?
            AND p.date_published >= DATE_SUB(DATE(?), INTERVAL 1 DAY)
          ORDER BY p.last_modified ASC, p.publication_id ASC
          LIMIT ${MAX_CANDIDATES + 1}`,
        [watermark, watermark],
    )
    const partial = issueRows.length > MAX_CANDIDATES || pubRows.length > MAX_CANDIDATES
    // Resume point for a capped run: the earliest "last processed" timestamp of the capped lists.
    const resumeAt = [issueRows, pubRows]
        .filter((rows) => rows.length > MAX_CANDIDATES)
        .map((rows) => rows[MAX_CANDIDATES - 1].lm)
        .sort()[0]

    let issues = 0
    let articles = 0
    const newIssueEvents: bigint[] = []
    const handledSubmissions = new Set<number>()

    const recordArticle = async (a: CurrentIssueArticle, j: JournalInfo, issueId: number | null, publishedAt: Date) => {
        handledSubmissions.add(a.submissionId)
        const snap = articleSnapshot(a, j, issueId)
        const id = await recordEvent({
            kind: "article",
            dedupe_key: publicationDedupeKey("article", a.submissionId),
            ojs_journal_id: j.ojsId,
            ojs_issue_id: issueId !== null ? BigInt(issueId) : null,
            ojs_submission_id: BigInt(a.submissionId),
            ojs_publication_id: BigInt(a.publicationId),
            published_at: publishedAt,
            snapshot: snap as unknown as Prisma.InputJsonValue,
            discipline_ids: resolveDisciplines(j.disciplineIds, snap.section_id, snap.keywords, ctx).map(String),
        })
        if (id) articles++
    }

    for (const row of issueRows.slice(0, MAX_CANDIDATES)) {
        const j = await journalInfo(row.journal_id)
        const issue = j ? await fetchIssueWithArticles(j.ojsId, row.issue_id) : null
        if (!j || !issue) continue
        const publishedAt = new Date(issue.datePublished ?? row.date_published)
        const issueSnap: IssueSnapshot = {
            title: issue.title,
            volume: issue.volume,
            number: issue.number,
            year: issue.year,
            cover_url: issue.issueCoverUrl,
            journal_title: j.title,
            journal_issn: j.issn,
            journal_id: j.localId?.toString() ?? null,
            url: `${getAppBaseUrl()}/journals/${j.ojsId}/issues/${issue.volume ?? ""}/${issue.number ?? ""}`,
            articles: issue.articles.map((a) => {
                const s = articleSnapshot(a, j, issue.issueId)
                return { title: s.title, authors: s.authors, doi: s.doi, section: s.section, is_open_access: s.is_open_access, url: s.url }
            }),
        }
        const issueDisciplines = new Set(j.disciplineIds.map(String))
        for (const a of issue.articles) {
            for (const d of resolveDisciplines([], a.sectionId ?? null, a.keywords ?? [], ctx)) issueDisciplines.add(String(d))
        }
        const id = await recordEvent({
            kind: "issue",
            dedupe_key: publicationDedupeKey("issue", issue.issueId),
            ojs_journal_id: j.ojsId,
            ojs_issue_id: BigInt(issue.issueId),
            published_at: publishedAt,
            snapshot: issueSnap as unknown as Prisma.InputJsonValue,
            discipline_ids: [...issueDisciplines],
        })
        if (id) {
            issues++
            newIssueEvents.push(id)
        }
        for (const a of issue.articles) await recordArticle(a, j, issue.issueId, publishedAt)
    }

    // Continuous publishing: published articles whose issue was not detected above.
    const byIssue = new Map<number, typeof pubRows>()
    for (const p of pubRows.slice(0, MAX_CANDIDATES)) {
        if (handledSubmissions.has(p.submission_id) || p.issue_id === null) continue
        byIssue.set(p.issue_id, [...(byIssue.get(p.issue_id) ?? []), p])
    }
    for (const [issueId, pubs] of byIssue) {
        const j = await journalInfo(pubs[0].journal_id)
        if (!j) continue
        const wanted = new Set(pubs.map((p) => p.publication_id))
        const list = await fetchArticlesWithAuthors(issueId, Number(j.ojsId), j.primaryLocale, j.urlPath)
        for (const a of list) {
            if (!wanted.has(a.publicationId) || handledSubmissions.has(a.submissionId)) continue
            const pub = pubs.find((p) => p.publication_id === a.publicationId)!
            await recordArticle(a, j, issueId, new Date(pub.date_published))
        }
    }

    const drafts = await draftIssueCampaigns(newIssueEvents)
    const next = partial ? resumeAt : now
    await writeWatermark(next)
    return { initialised: false, watermark: next, issues, articles, drafts, partial }
}

// ─── Drafting ─────────────────────────────────────────────────────────

/** One draft `issue` campaign per new issue event whose effective rule allows auto-drafting. */
export async function draftIssueCampaigns(eventIds: bigint[]): Promise<number> {
    if (!eventIds.length) return 0
    const [rules, audience, events] = await Promise.all([
        loadRules(),
        loadActiveAudience(),
        prisma.publicationEvent.findMany({ where: { id: { in: eventIds }, campaign_id: null } }),
    ])
    const defaultTemplateId = await ensureNotificationTemplate(prisma, NOTIFICATION_TEMPLATE_KEYS.newIssue)

    let drafts = 0
    for (const ev of events) {
        const snap = ev.snapshot as unknown as IssueSnapshot
        const journalId = snap.journal_id ? BigInt(snap.journal_id) : null
        const disciplineIds = (ev.discipline_ids as string[]).map(BigInt)
        const rule = effectiveRule(rules, "issue_published", journalId, disciplineIds)
        if (!rule.enabled || !rule.auto_draft) continue

        const recipients = resolveRecipients({ event_type: "issue_published", journal_id: journalId, discipline_ids: disciplineIds }, audience, rules)
        const payload: CampaignPayload = { event_ids: [ev.id.toString()], journal_id: snap.journal_id }
        const campaign = await prisma.notificationCampaign.create({
            data: {
                type: "issue",
                status: "draft",
                template_id: rule.template_id ?? defaultTemplateId,
                payload: payload as unknown as Prisma.InputJsonValue,
                recipient_estimate: recipients.length,
            },
            select: { id: true },
        })
        await prisma.publicationEvent.update({ where: { id: ev.id }, data: { campaign_id: campaign.id } })
        drafts++
    }
    return drafts
}
