/**
 * Checks admin-edited campaign content before it is saved or turned into a
 * template. Every alert must keep its legally required footer (unsubscribe,
 * manage preferences, postal address) and may insert raw HTML only through
 * the server-built, escaped blocks.
 */

import { RAW_BLOCK_VARIABLES } from "./render-blocks"

export class ContentGuardError extends Error {}

const REQUIRED_HTML = [
    ["{{unsubscribe_url}}", "the unsubscribe link"],
    ["{{manage_url}}", "the manage-preferences link"],
    ["{{publisher_address}}", "the postal address"],
] as const

/** Problems with the content, as sentences for the admin; empty when it is fine. */
export function contentProblems(html: string, text: string | null | undefined): string[] {
    const problems: string[] = []
    if (!html.trim()) problems.push("The HTML version is empty.")
    for (const [token, label] of REQUIRED_HTML) {
        if (!html.includes(token)) problems.push(`The HTML version must keep ${label} (${token}).`)
    }
    if (text && text.trim() && !text.includes("{{unsubscribe_url}}")) {
        problems.push("The plain-text version must keep the unsubscribe link ({{unsubscribe_url}}).")
    }
    const raw = [...html.matchAll(/\{\{\{(\w+)\}\}\}/g)].map((m) => m[1])
        .filter((name) => !(RAW_BLOCK_VARIABLES as readonly string[]).includes(name))
    if (raw.length) {
        problems.push(`Triple braces {{{…}}} are only allowed for ${RAW_BLOCK_VARIABLES.join(", ")}; found ${[...new Set(raw)].join(", ")}.`)
    }
    return problems
}

/** Throws a ContentGuardError listing every problem. */
export function assertContentOk(html: string, text: string | null | undefined): void {
    const problems = contentProblems(html, text)
    if (problems.length) throw new ContentGuardError(problems.join(" "))
}
