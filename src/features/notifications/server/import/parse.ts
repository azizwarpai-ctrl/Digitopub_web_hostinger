import * as XLSX from "xlsx"

/**
 * Researcher-list parser for subscriber imports. Everything happens in
 * memory; the uploaded file is never written anywhere.
 *
 * - `.xlsx` / `.xls`: first worksheet via SheetJS.
 * - `.csv` / `.txt`: decoded as UTF-8 (BOM stripped). A delimiter (tab,
 *   semicolon or comma) is detected from the first lines and the text is
 *   parsed by SheetJS so quoted fields work. A `.txt` with no delimiter is
 *   treated as one email per line.
 */

export const IMPORT_FILE_TYPES = ["xlsx", "xls", "csv", "txt"] as const
export type ImportFileType = (typeof IMPORT_FILE_TYPES)[number]

export interface ColumnMap {
    email: number
    name?: number
    first_name?: number
    last_name?: number
    interests?: number
}

export interface ParsedSheet {
    fileType: ImportFileType
    /** Header labels; synthetic "Column N" labels when the file has no header row. */
    headers: string[]
    hasHeaderRow: boolean
    /** Data rows only (header excluded), blank rows removed, cells trimmed. */
    rows: string[][]
    detected: ColumnMap | null
}

export interface ImportCandidate {
    /** 1-based row number as the admin sees it in the source file. */
    row_no: number
    email: string
    name: string | null
    raw_interests: string | null
}

export class ImportParseError extends Error {}

export function fileTypeFromName(fileName: string): ImportFileType | null {
    const ext = fileName.toLowerCase().split(".").pop() ?? ""
    return (IMPORT_FILE_TYPES as readonly string[]).includes(ext) ? (ext as ImportFileType) : null
}

const HEADER_PATTERNS: Array<[keyof ColumnMap, RegExp]> = [
    ["email", /^(e-?mail|mail|email address|e-mail address)$/],
    ["first_name", /^(first ?name|given ?name|forename)$/],
    ["last_name", /^(last ?name|surname|family ?name)$/],
    ["name", /^(name|full ?name|researcher|author|contact)$/],
    ["interests", /^(interests?|research( interests?| areas?| fields?)?|keywords?|disciplines?|fields?( of interest)?|areas? of interest|specialty|speciality|specialization)$/],
]

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[_\s]+/g, " ")

export function detectColumns(headers: string[]): ColumnMap | null {
    const map: Partial<ColumnMap> = {}
    headers.forEach((raw, index) => {
        const h = normHeader(raw)
        for (const [key, re] of HEADER_PATTERNS) {
            if (map[key] === undefined && re.test(h)) {
                map[key] = index
                break
            }
        }
    })
    return map.email === undefined ? null : (map as ColumnMap)
}

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

/** For header-less files: the column where most non-empty cells look like emails. */
function guessEmailColumn(rows: string[][]): number | null {
    const sample = rows.slice(0, 50)
    const width = Math.max(0, ...sample.map((r) => r.length))
    let best: { index: number; hits: number } | null = null
    for (let i = 0; i < width; i++) {
        const hits = sample.filter((r) => looksLikeEmail(r[i] ?? "")).length
        if (hits > 0 && (!best || hits > best.hits)) best = { index: i, hits }
    }
    return best?.index ?? null
}

/** Occurrences of `d` outside double-quoted spans. */
function countUnquoted(line: string, d: string): number {
    let n = 0
    let quoted = false
    for (const ch of line) {
        if (ch === '"') quoted = !quoted
        else if (ch === d && !quoted) n++
    }
    return n
}

/**
 * Picks the delimiter that splits the FIRST line the most and appears on most
 * sampled lines. Anchoring on the first line matters: a comma CSV whose
 * interest cells contain semicolons must still be read as comma-delimited.
 */
function detectDelimiter(text: string): string | null {
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10)
    if (!lines.length) return null
    let best: { d: string; count: number } | null = null
    for (const d of ["\t", ",", ";"]) {
        const count = countUnquoted(lines[0], d)
        if (count === 0) continue
        const withD = lines.filter((l) => countUnquoted(l, d) > 0).length
        if (withD < Math.ceil(lines.length * 0.6)) continue
        if (!best || count > best.count) best = { d, count }
    }
    return best?.d ?? null
}

function sheetToMatrix(sheet: XLSX.WorkSheet | undefined): string[][] {
    if (!sheet) return []
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false })
    return raw.map((r) => r.map((c) => String(c ?? "").trim()))
}

function readMatrix(buffer: Uint8Array, fileType: ImportFileType): string[][] {
    if (fileType === "xlsx" || fileType === "xls") {
        let wb: XLSX.WorkBook
        try {
            wb = XLSX.read(buffer, { type: "array", dense: true })
        } catch {
            throw new ImportParseError("The spreadsheet could not be read. Save it as .xlsx or .csv and try again.")
        }
        return sheetToMatrix(wb.Sheets[wb.SheetNames[0]])
    }

    const text = new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "")
    const delimiter = detectDelimiter(text)
    if (!delimiter) {
        if (fileType === "csv") {
            // A single-column CSV: one value per line.
            return text.split(/\r?\n/).map((l) => [l.trim().replace(/^"(.*)"$/, "$1")])
        }
        return text.split(/\r?\n/).map((l) => [l.trim()])
    }
    const wb = XLSX.read(text, { type: "string", FS: delimiter, raw: true, dense: true })
    return sheetToMatrix(wb.Sheets[wb.SheetNames[0]])
}

export function parseImportFile(buffer: Uint8Array, fileName: string, maxRows: number): ParsedSheet {
    const fileType = fileTypeFromName(fileName)
    if (!fileType) throw new ImportParseError("Unsupported file type. Upload an .xlsx, .xls, .csv or .txt file.")

    const matrix = readMatrix(buffer, fileType).filter((r) => r.some((c) => c !== ""))
    if (!matrix.length) throw new ImportParseError("The file is empty.")

    const first = matrix[0]
    const detectedFromHeader = detectColumns(first)
    const hasHeaderRow = detectedFromHeader !== null || !first.some(looksLikeEmail)
    const rows = hasHeaderRow ? matrix.slice(1) : matrix

    if (rows.length > maxRows) {
        throw new ImportParseError(`The file has ${rows.length} rows; the limit is ${maxRows}. Split it into smaller files.`)
    }

    const width = Math.max(...matrix.map((r) => r.length))
    const headers = hasHeaderRow
        ? Array.from({ length: width }, (_, i) => first[i] || `Column ${i + 1}`)
        : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)

    let detected = detectedFromHeader
    if (!detected) {
        const emailCol = guessEmailColumn(rows)
        detected = emailCol === null ? null : { email: emailCol }
    }

    return { fileType, headers, hasHeaderRow, rows, detected }
}

/** Apply a column map to parsed rows. Row numbers are 1-based in the source file. */
export function toCandidates(sheet: Pick<ParsedSheet, "rows" | "hasHeaderRow">, map: ColumnMap): ImportCandidate[] {
    const offset = sheet.hasHeaderRow ? 2 : 1
    const cell = (row: string[], i: number | undefined) => (i === undefined ? "" : (row[i] ?? "").trim())
    return sheet.rows.map((row, i) => {
        const full = cell(row, map.name)
        const split = [cell(row, map.first_name), cell(row, map.last_name)].filter(Boolean).join(" ")
        const name = full || split
        const interests = cell(row, map.interests)
        return {
            row_no: i + offset,
            email: cell(row, map.email).toLowerCase(),
            name: name || null,
            raw_interests: interests || null,
        }
    })
}
