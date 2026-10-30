/**
 * Times-cited counts for DigitoPub articles (#232).
 *
 * A daily cron (POST /api/metrics/cron/citations) asks Crossref for
 * `is-referenced-by-count` and OpenAlex for `cited_by_count`, keeps the
 * higher of the two, and stores it in article_citation_counts. Pages and
 * GET /api/metrics/citations only read that table, so a visitor never waits
 * on an external API, and an outage only means yesterday's number.
 */

import { prisma } from "@/src/lib/db/config"
import { ojsQuery } from "@/src/features/ojs/server/ojs-client"

/** DigitoPub's Crossref prefix; the API refuses other DOIs so it can't proxy arbitrary lookups. */
const DOI_RE = /^10\.26629\/[^\s?#]{1,200}$/i
export const MAX_BATCH = 50
const FETCH_TIMEOUT_MS = 10_000
const CONCURRENCY = 4

export type CitationSource = "crossref" | "openalex"

export interface CitationCount {
  doi: string
  count: number
  source: CitationSource
  fetched_at: Date | null
}

/** Lower-cased bare DOI ("10.26629/x"), or null when it isn't a DigitoPub DOI. */
export function normalizeDoi(raw: string | null | undefined): string | null {
  const doi = (raw ?? "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:/i, "").toLowerCase()
  return DOI_RE.test(doi) ? doi : null
}

function contactMailto(): string | undefined {
  return process.env.CROSSREF_MAILTO || process.env.SMTP_FROM_EMAIL || undefined
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const mailto = contactMailto()
  const res = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      // Crossref and OpenAlex ask for a contact in the User-Agent ("polite pool").
      "User-Agent": `DigitoPub/1.0 (https://digitopub.com${mailto ? `; mailto:${mailto}` : ""})`,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Crossref's `is-referenced-by-count`, null when Crossref doesn't know the DOI. */
export async function fetchCrossrefCount(doi: string, fetchImpl: FetchLike = fetch): Promise<number | null> {
  const body = (await getJson(fetchImpl, `https://api.crossref.org/works/${encodeURIComponent(doi)}`)) as
    | { message?: { "is-referenced-by-count"?: unknown } }
    | null
  const n = body?.message?.["is-referenced-by-count"]
  return typeof n === "number" && n >= 0 ? n : null
}

/** OpenAlex's `cited_by_count`, null when OpenAlex doesn't know the DOI. */
export async function fetchOpenAlexCount(doi: string, fetchImpl: FetchLike = fetch): Promise<number | null> {
  const mailto = contactMailto()
  const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ""}`
  const body = (await getJson(fetchImpl, url)) as { cited_by_count?: unknown } | null
  const n = body?.cited_by_count
  return typeof n === "number" && n >= 0 ? n : null
}

/**
 * The best count for a DOI: the higher of Crossref and OpenAlex (Crossref on
 * a tie). Throws only when neither source answered.
 */
export async function lookupCitationCount(
  doi: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ count: number; source: CitationSource; partial: boolean }> {
  const [crossref, openalex] = await Promise.allSettled([
    fetchCrossrefCount(doi, fetchImpl),
    fetchOpenAlexCount(doi, fetchImpl),
  ])
  const c = crossref.status === "fulfilled" ? crossref.value : null
  const o = openalex.status === "fulfilled" ? openalex.value : null
  if (c === null && o === null) {
    const reasons = [crossref, openalex].map((r) => (r.status === "rejected" ? String(r.reason?.message ?? r.reason) : "not found"))
    throw new Error(`crossref: ${reasons[0]}; openalex: ${reasons[1]}`)
  }
  // Partial: a source errored (not merely "not found"), so the count may be low.
  const partial = crossref.status === "rejected" || openalex.status === "rejected"
  if (o !== null && (c === null || o > c)) return { count: o, source: "openalex", partial }
  return { count: c as number, source: "crossref", partial }
}

/** Published DigitoPub DOIs from OJS (read-only). */
export async function listPublishedDois(): Promise<string[]> {
  const rows = await ojsQuery<{ doi: string | null }>(
    `SELECT d.doi FROM publications p JOIN dois d ON d.doi_id = p.doi_id WHERE p.status = 3`,
  )
  return [...new Set(rows.map((r) => normalizeDoi(r.doi)).filter((d): d is string => d !== null))]
}

export interface RefreshStats {
  total: number
  checked: number
  updated: number
  failed: number
  remaining: number
}

/**
 * Refreshes counts, least recently checked first, until `deadline`. A DOI
 * whose lookup fails keeps its last count and records the error.
 */
export async function refreshCitationCounts(opts: {
  deadline: number
  fetchImpl?: FetchLike
  dois?: string[]
}): Promise<RefreshStats> {
  const dois = opts.dois ?? (await listPublishedDois())
  const existing = await prisma.articleCitationCount.findMany({
    where: { doi: { in: dois } },
    select: { doi: true, checked_at: true, count: true },
  })
  const lastChecked = new Map(existing.map((r) => [r.doi, r.checked_at.getTime()]))
  const lastCount = new Map(existing.map((r) => [r.doi, r.count]))
  const queue = [...dois].sort((a, b) => (lastChecked.get(a) ?? 0) - (lastChecked.get(b) ?? 0))

  const stats: RefreshStats = { total: dois.length, checked: 0, updated: 0, failed: 0, remaining: 0 }
  let next = 0
  const worker = async () => {
    while (next < queue.length && Date.now() < opts.deadline) {
      const doi = queue[next++]
      const now = new Date()
      try {
        const { count, source, partial } = await lookupCitationCount(doi, opts.fetchImpl)
        // One source errored and the other reports fewer: keep the stored count.
        const stored = lastCount.get(doi)
        if (partial && stored !== undefined && count < stored) {
          await prisma.articleCitationCount.update({ where: { doi }, data: { checked_at: now, error: "partial lookup; kept higher stored count" } })
          stats.checked++
          continue
        }
        await prisma.articleCitationCount.upsert({
          where: { doi },
          create: { doi, count, source, fetched_at: now, checked_at: now },
          update: { count, source, fetched_at: now, checked_at: now, error: null },
        })
        stats.updated++
      } catch (e) {
        const error = (e instanceof Error ? e.message : String(e)).slice(0, 255)
        // Bookkeeping only; a DB error here must not stop the other workers.
        await prisma.articleCitationCount.upsert({
          where: { doi },
          create: { doi, count: 0, source: "crossref", checked_at: now, error },
          update: { checked_at: now, error },
        }).catch(() => undefined)
        stats.failed++
      }
      stats.checked++
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  stats.remaining = queue.length - stats.checked
  return stats
}

/** Stored counts for DigitoPub DOIs (database only; never calls out). */
export async function getCitationCounts(rawDois: string[]): Promise<CitationCount[]> {
  const dois = [...new Set(rawDois.map(normalizeDoi).filter((d): d is string => d !== null))].slice(0, MAX_BATCH)
  if (!dois.length) return []
  const rows = await prisma.articleCitationCount.findMany({
    where: { doi: { in: dois }, fetched_at: { not: null } },
    select: { doi: true, count: true, source: true, fetched_at: true },
  })
  return rows.map((r) => ({ doi: r.doi, count: r.count, source: r.source as CitationSource, fetched_at: r.fetched_at }))
}
