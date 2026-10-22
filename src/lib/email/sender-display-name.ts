/** Display names for the publication-alert From header (no server-only imports, so tests and UI code can share them). */

export const DEFAULT_SENDER_NAME = "DigitoPub"

/** A display name safe for the From header: no quotes, backslashes or line breaks, at most 100 characters. */
export function cleanSenderName(name: string | null | undefined): string {
    return (name ?? "").replace(/["\\\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100).trim()
}

/** The name used when a campaign has no journal-specific one: NOTIFY_FROM_NAME, else "DigitoPub". */
export function defaultSenderName(): string {
    return cleanSenderName(process.env.NOTIFY_FROM_NAME) || DEFAULT_SENDER_NAME
}
