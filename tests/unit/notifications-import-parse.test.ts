import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"

import {
    detectColumns,
    fileTypeFromName,
    ImportParseError,
    parseImportFile,
    toCandidates,
} from "@/src/features/notifications/server/import/parse"

const enc = (s: string) => new TextEncoder().encode(s)

function workbookBytes(rows: unknown[][], bookType: "xlsx" | "xls"): Uint8Array {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1")
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: bookType === "xls" ? "biff8" : "xlsx" }))
}

const TABLE = [
    ["Full Name", "E-mail", "Research Interests"],
    ["Dr. Amal Ali", "Amal@Example.org", "Orthodontics; clear aligners"],
    ["", "", ""],
    ["Omar Saleh", "omar@example.org", "Endodontics"],
]

describe("fileTypeFromName", () => {
    it("accepts the four formats case-insensitively", () => {
        expect(fileTypeFromName("list.XLSX")).toBe("xlsx")
        expect(fileTypeFromName("a.b.csv")).toBe("csv")
        expect(fileTypeFromName("list.pdf")).toBeNull()
    })
})

describe("detectColumns", () => {
    it("recognises header variants", () => {
        expect(detectColumns(["Full Name", "E-mail", "Research Interests"])).toEqual({ name: 0, email: 1, interests: 2 })
        expect(detectColumns(["first_name", "Last Name", "email address", "Keywords"]))
            .toEqual({ first_name: 0, last_name: 1, email: 2, interests: 3 })
        expect(detectColumns(["mail", "Field of interest"])).toEqual({ email: 0, interests: 1 })
        expect(detectColumns(["foo", "bar"])).toBeNull()
    })
})

describe("parseImportFile", () => {
    for (const bookType of ["xlsx", "xls"] as const) {
        it(`reads .${bookType}`, () => {
            const sheet = parseImportFile(workbookBytes(TABLE, bookType), `list.${bookType}`, 100)
            expect(sheet.fileType).toBe(bookType)
            expect(sheet.hasHeaderRow).toBe(true)
            expect(sheet.rows).toHaveLength(2) // blank row dropped
            const cands = toCandidates(sheet, sheet.detected!)
            expect(cands[0]).toEqual({ row_no: 2, email: "amal@example.org", name: "Dr. Amal Ali", raw_interests: "Orthodontics; clear aligners" })
            expect(cands[1].email).toBe("omar@example.org")
        })
    }

    it("reads a comma CSV with BOM, quotes and embedded semicolons", () => {
        const csv = '﻿name,email,interests\r\n"Saleh, Omar",omar@example.org,"Endodontics; pulp"\r\n\r\nAmal,amal@example.org,Orthodontics\r\n'
        const sheet = parseImportFile(enc(csv), "list.csv", 100)
        expect(sheet.headers).toEqual(["name", "email", "interests"])
        const cands = toCandidates(sheet, sheet.detected!)
        expect(cands).toHaveLength(2)
        expect(cands[0]).toMatchObject({ name: "Saleh, Omar", raw_interests: "Endodontics; pulp" })
    })

    it("reads a semicolon CSV", () => {
        const sheet = parseImportFile(enc("email;name\na@example.org;A\nb@example.org;B\n"), "list.csv", 100)
        expect(toCandidates(sheet, sheet.detected!).map((c) => c.email)).toEqual(["a@example.org", "b@example.org"])
    })

    it("reads a tab-delimited TXT", () => {
        const sheet = parseImportFile(enc("Email\tName\tKeywords\nx@example.org\tX Y\tPeriodontology, implants\n"), "list.txt", 100)
        expect(toCandidates(sheet, sheet.detected!)[0]).toEqual({
            row_no: 2, email: "x@example.org", name: "X Y", raw_interests: "Periodontology, implants",
        })
    })

    it("reads a one-email-per-line TXT without a header", () => {
        const sheet = parseImportFile(enc("A@Example.org\n\nb@example.org\r\nc@example.org"), "list.txt", 100)
        expect(sheet.hasHeaderRow).toBe(false)
        expect(sheet.detected).toEqual({ email: 0 })
        expect(toCandidates(sheet, sheet.detected!).map((c) => [c.row_no, c.email])).toEqual([
            [1, "a@example.org"], [2, "b@example.org"], [3, "c@example.org"],
        ])
    })

    it("joins first + last name when there is no full-name column", () => {
        const sheet = parseImportFile(enc("first name,last name,email\nAmal,Ali,amal@example.org\n"), "l.csv", 100)
        expect(toCandidates(sheet, sheet.detected!)[0].name).toBe("Amal Ali")
    })

    it("guesses the email column in a header-less table", () => {
        const sheet = parseImportFile(enc("Amal,amal@example.org\nOmar,omar@example.org\n"), "l.csv", 100)
        expect(sheet.hasHeaderRow).toBe(false)
        expect(sheet.detected).toEqual({ email: 1 })
    })

    it("rejects files over the row limit with a clear message", () => {
        const many = ["email", ...Array.from({ length: 6 }, (_, i) => `u${i}@example.org`)].join("\n")
        expect(() => parseImportFile(enc(many), "l.csv", 5)).toThrow(/6 rows; the limit is 5/)
    })

    it("rejects unsupported and empty files", () => {
        expect(() => parseImportFile(enc("x"), "l.pdf", 5)).toThrow(ImportParseError)
        expect(() => parseImportFile(enc("\n\n"), "l.csv", 5)).toThrow(/empty/)
    })
})
