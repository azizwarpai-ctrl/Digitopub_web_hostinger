import { z } from "zod"

/** Most addresses one test send may go to (#224). */
export const MAX_TEST_RECIPIENTS = 10

const emailSchema = z.email()

/**
 * Splits pasted or typed addresses (commas, semicolons, spaces or new
 * lines), trims and lower-cases them, drops duplicates and sorts out the
 * ones that are not valid email addresses. Order of first appearance is kept.
 */
export function parseEmailList(input: string | readonly string[]): { valid: string[]; invalid: string[] } {
    const parts = (typeof input === "string" ? [input] : [...input])
        .flatMap((s) => s.split(/[\s,;]+/))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    const valid: string[] = []
    const invalid: string[] = []
    for (const p of new Set(parts)) (emailSchema.safeParse(p).success ? valid : invalid).push(p)
    return { valid, invalid }
}

/** Recipients field shared by every test-send request: 1 to MAX_TEST_RECIPIENTS valid addresses. */
export const testRecipientsSchema = z.array(z.email().max(255)).min(1).max(MAX_TEST_RECIPIENTS)

/** Merges the legacy single `to` with `recipients`, lower-cased and without duplicates. */
export function collectRecipients(input: { to?: string | null; recipients?: readonly string[] | null }): string[] {
    return parseEmailList([...(input.to ? [input.to] : []), ...(input.recipients ?? [])]).valid
}
