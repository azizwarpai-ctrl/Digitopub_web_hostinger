/**
 * Maps free-text research interests (from imports, and later OJS article
 * keywords) onto the controlled discipline taxonomy.
 *
 * Matching order per term: exact match on a normalized discipline name or
 * synonym, then Levenshtein distance <= 2 for terms of 6+ characters. Terms
 * that match nothing are returned as `unmapped` so the admin can map them.
 */

export interface DisciplineForMatching {
    id: bigint | string
    name: string
    synonyms: unknown
    is_active?: boolean
}

export interface DisciplineIndex {
    exact: Map<string, string>
    /** Entries eligible for fuzzy matching (6+ characters). */
    fuzzy: Array<{ term: string; id: string }>
}

export interface InterestMapping {
    discipline_ids: string[]
    unmapped: string[]
}

const FUZZY_MIN_LENGTH = 6
const FUZZY_MAX_DISTANCE = 2

/** Lowercase, strip accents, turn punctuation into spaces, collapse spaces. */
export function normalizeTerm(raw: string): string {
    return raw
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ")
}

/**
 * Split an interests cell on `; , |` and newlines; returns trimmed, non-empty
 * raw terms. `/` is handled in `mapInterests`, because some terms contain it
 * ("CAD/CAM").
 */
export function splitInterests(raw: string | null | undefined): string[] {
    if (!raw) return []
    return raw
        .split(/[;,|\n]+/)
        .map((t) => t.trim())
        .filter(Boolean)
}

export function synonymsOf(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : []
}

export function buildDisciplineIndex(disciplines: DisciplineForMatching[]): DisciplineIndex {
    const exact = new Map<string, string>()
    const fuzzy: DisciplineIndex["fuzzy"] = []
    for (const d of disciplines) {
        if (d.is_active === false) continue
        const id = String(d.id)
        for (const term of [d.name, ...synonymsOf(d.synonyms)]) {
            const n = normalizeTerm(term)
            if (!n || exact.has(n)) continue
            exact.set(n, id)
            if (n.length >= FUZZY_MIN_LENGTH) fuzzy.push({ term: n, id })
        }
    }
    return { exact, fuzzy }
}

/** Levenshtein distance with an early exit once every cell in a row exceeds `max`. */
export function levenshtein(a: string, b: string, max = Infinity): number {
    if (a === b) return 0
    if (Math.abs(a.length - b.length) > max) return max + 1
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
    for (let i = 1; i <= a.length; i++) {
        const cur = [i]
        let rowMin = i
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if (cur[j] < rowMin) rowMin = cur[j]
        }
        if (rowMin > max) return max + 1
        prev = cur
    }
    return prev[b.length]
}

/** Returns the discipline id for one term, or null. */
export function matchTerm(term: string, index: DisciplineIndex): string | null {
    const n = normalizeTerm(term)
    if (!n) return null
    const hit = index.exact.get(n)
    if (hit) return hit
    if (n.length < FUZZY_MIN_LENGTH) return null

    let best: { id: string; dist: number } | null = null
    for (const entry of index.fuzzy) {
        const dist = levenshtein(n, entry.term, FUZZY_MAX_DISTANCE)
        if (dist <= FUZZY_MAX_DISTANCE && (!best || dist < best.dist)) {
            best = { id: entry.id, dist }
            if (dist === 1) break
        }
    }
    return best?.id ?? null
}

export function mapInterests(raw: string | null | undefined, index: DisciplineIndex): InterestMapping {
    const ids = new Set<string>()
    const unmapped: string[] = []
    const seenUnmapped = new Set<string>()
    // "/" separates terms, but some terms contain it ("CAD/CAM"): split on
    // spaced slashes first, then try each part whole before splitting it.
    const terms = splitInterests(raw)
        .flatMap((seg) => seg.split(/\s+\/\s+/))
        .flatMap((part) =>
            part.includes("/") && !matchTerm(part, index)
                ? part.split("/").map((t) => t.trim()).filter(Boolean)
                : [part.trim()],
        )
        .filter(Boolean)
    for (const term of terms) {
        const id = matchTerm(term, index)
        if (id) {
            ids.add(id)
        } else {
            const n = normalizeTerm(term)
            if (n && !seenUnmapped.has(n)) {
                seenUnmapped.add(n)
                unmapped.push(n)
            }
        }
    }
    return { discipline_ids: [...ids], unmapped }
}
