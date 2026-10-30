"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/src/lib/rpc"

export type CitationSource = "crossref" | "openalex"

export interface CitationCount {
  count: number
  source: CitationSource
}

const DOI_RE = /^10\.26629\/\S+$/
const MAX_BATCH = 50
const BATCH_WINDOW_MS = 10

/** Client-side twin of normalizeDoi in citations-service.ts. */
function normalizeDoi(raw: string | null | undefined): string | null {
  const doi = (raw ?? "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .toLowerCase()
  return DOI_RE.test(doi) ? doi : null
}

interface Pending {
  resolve: (v: CitationCount | null) => void
  reject: (e: unknown) => void
}

const pending = new Map<string, Pending[]>()
let timer: ReturnType<typeof setTimeout> | null = null

async function fetchChunk(dois: string[]): Promise<void> {
  try {
    const res = await client.metrics.citations.$get({ query: { dois: dois.join(",") } })
    if (!res.ok) throw new Error(`citations request failed (${res.status})`)
    const json = (await res.json()) as {
      data?: { doi: string; count: number; source: CitationSource }[]
    }
    const found = new Map<string, CitationCount>()
    for (const row of json.data ?? []) {
      found.set(row.doi.toLowerCase(), { count: row.count, source: row.source })
    }
    for (const doi of dois) {
      const value = found.get(doi) ?? null
      for (const p of pending.get(doi) ?? []) p.resolve(value)
    }
  } catch (err) {
    for (const doi of dois) for (const p of pending.get(doi) ?? []) p.reject(err)
  } finally {
    for (const doi of dois) pending.delete(doi)
  }
}

function flush() {
  timer = null
  const dois = [...pending.keys()]
  // Detach the waiters of this flush so new requests start a fresh batch.
  const snapshot = new Map(pending)
  pending.clear()
  for (let i = 0; i < dois.length; i += MAX_BATCH) {
    const chunk = dois.slice(i, i + MAX_BATCH)
    const sub = new Map<string, Pending[]>()
    for (const d of chunk) sub.set(d, snapshot.get(d) ?? [])
    void runChunk(chunk, sub)
  }
}

async function runChunk(chunk: string[], waiters: Map<string, Pending[]>) {
  // fetchChunk reads from the module-level map; swap in this chunk's waiters.
  for (const [d, w] of waiters) pending.set(d, [...(pending.get(d) ?? []), ...w])
  await fetchChunk(chunk)
}

function requestCount(doi: string): Promise<CitationCount | null> {
  return new Promise((resolve, reject) => {
    const list = pending.get(doi) ?? []
    list.push({ resolve, reject })
    pending.set(doi, list)
    if (!timer) timer = setTimeout(flush, BATCH_WINDOW_MS)
  })
}

export function useCitationCount(doi: string | null | undefined): {
  data: CitationCount | null
  isLoading: boolean
} {
  const normalized = normalizeDoi(doi)
  const query = useQuery({
    queryKey: ["citation-count", normalized],
    queryFn: () => requestCount(normalized as string),
    enabled: normalized !== null,
    staleTime: 60 * 60 * 1000,
  })
  return { data: query.data ?? null, isLoading: normalized !== null && query.isLoading }
}

export { normalizeDoi as normalizeCitationDoi }
