import { describe, it, expect } from "vitest"

import {
    buildDisciplineIndex,
    levenshtein,
    mapInterests,
    normalizeTerm,
    splitInterests,
} from "@/src/features/notifications/server/import/map-interests"
import { stageCandidates } from "@/src/features/notifications/server/import/stage"

const index = buildDisciplineIndex([
    { id: 1n, name: "Orthodontics", synonyms: ["clear aligners", "malocclusion"] },
    { id: 2n, name: "Endodontics", synonyms: ["root canal"] },
    { id: 3n, name: "Digital Dentistry", synonyms: ["cad/cam", "3d printing"] },
    { id: 4n, name: "Retired", synonyms: ["obsolete"], is_active: false },
])

describe("normalizeTerm / splitInterests", () => {
    it("lowercases, strips accents and punctuation", () => {
        expect(normalizeTerm("  Ortodôntica!! ")).toBe("ortodontica")
        expect(normalizeTerm("Oral & Maxillofacial")).toBe("oral and maxillofacial")
    })
    it("splits on ; , | and newlines", () => {
        expect(splitInterests("a; b,c | d\ne")).toEqual(["a", "b", "c", "d", "e"])
        expect(splitInterests(null)).toEqual([])
    })
})

describe("levenshtein", () => {
    it("computes edit distance and exits early past the cap", () => {
        expect(levenshtein("kitten", "sitting")).toBe(3)
        expect(levenshtein("abc", "abc")).toBe(0)
        expect(levenshtein("abcdefgh", "zzzzzzzz", 2)).toBe(3)
    })
})

describe("mapInterests", () => {
    it("maps exact names and synonyms", () => {
        expect(mapInterests("Orthodontics; Root Canal", index)).toEqual({ discipline_ids: ["1", "2"], unmapped: [] })
    })
    it("maps fuzzy terms of 6+ characters within distance 2", () => {
        expect(mapInterests("Orthodontic, Endodonticss", index).discipline_ids).toEqual(["1", "2"])
    })
    it("does not fuzzy-match short terms", () => {
        expect(mapInterests("cad", index)).toEqual({ discipline_ids: [], unmapped: ["cad"] })
    })
    it("keeps slash terms whole when they match, otherwise splits them", () => {
        expect(mapInterests("CAD/CAM", index).discipline_ids).toEqual(["3"])
        expect(mapInterests("Endodontics/Orthodontics", index).discipline_ids).toEqual(["2", "1"])
        expect(mapInterests("Endodontics / CAD/CAM", index).discipline_ids).toEqual(["2", "3"])
    })
    it("lists unmapped terms once, normalized, and ignores inactive disciplines", () => {
        expect(mapInterests("Forensic Odontology; forensic odontology; obsolete", index)).toEqual({
            discipline_ids: [],
            unmapped: ["forensic odontology", "obsolete"],
        })
    })
})

describe("stageCandidates", () => {
    it("flags invalid, duplicate, existing and suppressed rows and totals them", () => {
        const existing = new Map([["old@example.org", "active"], ["gone@example.org", "bounced"]])
        const { rows, totals } = stageCandidates(
            [
                { row_no: 2, email: "new@example.org", name: "N", raw_interests: "Orthodontics; Forensics" },
                { row_no: 3, email: "not-an-email", name: null, raw_interests: null },
                { row_no: 4, email: "NEW@example.org", name: null, raw_interests: null },
                { row_no: 5, email: "old@example.org", name: null, raw_interests: null },
                { row_no: 6, email: "gone@example.org", name: null, raw_interests: null },
            ],
            existing,
            index,
        )
        expect(rows.map((r) => r.issue)).toEqual([null, "invalid_email", "duplicate_in_file", "exists", "suppressed"])
        expect(rows[0]).toMatchObject({ mapped_discipline_ids: ["1"], unmapped_terms: ["forensics"] })
        expect(totals).toEqual({ rows: 5, valid: 1, invalid: 1, duplicate: 1, existing: 1, suppressed: 1, unmapped_terms: 1 })
    })
})
