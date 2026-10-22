import { z } from "zod"

import { SUPPRESSED_STATUSES, type ImportRowIssue } from "../../constants"
import type { ImportCandidate } from "./parse"
import { mapInterests, type DisciplineIndex } from "./map-interests"

/** Pure classification of parsed candidates into staging rows and totals. */

export interface StagedRow {
    row_no: number
    email: string | null
    name: string | null
    raw_interests: string | null
    mapped_discipline_ids: string[]
    unmapped_terms: string[]
    issue: ImportRowIssue | null
}

export interface ImportTotals {
    rows: number
    valid: number
    invalid: number
    duplicate: number
    existing: number
    suppressed: number
    /** Distinct interest terms that matched no discipline, across all rows. */
    unmapped_terms: number
}

const emailSchema = z.email()
const SUPPRESSED = new Set<string>(SUPPRESSED_STATUSES)

/**
 * @param existing lowercased email -> current subscriber status, for every
 *   candidate email already in `notification_subscribers`.
 */
export function stageCandidates(
    candidates: ImportCandidate[],
    existing: Map<string, string>,
    index: DisciplineIndex,
): { rows: StagedRow[]; totals: ImportTotals } {
    const seen = new Set<string>()
    const rows = candidates.map((c): StagedRow => {
        const email = c.email.trim().toLowerCase()
        let issue: ImportRowIssue | null = null
        if (!emailSchema.safeParse(email).success) issue = "invalid_email"
        else if (seen.has(email)) issue = "duplicate_in_file"
        else {
            const status = existing.get(email)
            if (status !== undefined) issue = SUPPRESSED.has(status) ? "suppressed" : "exists"
        }
        if (issue !== "invalid_email") seen.add(email)

        const mapping = mapInterests(c.raw_interests, index)
        return {
            row_no: c.row_no,
            email: email || null,
            name: c.name,
            raw_interests: c.raw_interests,
            mapped_discipline_ids: mapping.discipline_ids,
            unmapped_terms: mapping.unmapped,
            issue,
        }
    })
    return { rows, totals: computeTotals(rows) }
}

export function computeTotals(
    rows: Array<Pick<StagedRow, "issue"> & { unmapped_terms: unknown }>,
): ImportTotals {
    const count = (i: ImportRowIssue) => rows.filter((r) => r.issue === i).length
    const unmapped = new Set<string>()
    for (const r of rows) {
        if (r.issue === null && Array.isArray(r.unmapped_terms)) {
            for (const t of r.unmapped_terms) if (typeof t === "string") unmapped.add(t)
        }
    }
    return {
        rows: rows.length,
        valid: rows.filter((r) => r.issue === null).length,
        invalid: count("invalid_email"),
        duplicate: count("duplicate_in_file"),
        existing: count("exists"),
        suppressed: count("suppressed"),
        unmapped_terms: unmapped.size,
    }
}
