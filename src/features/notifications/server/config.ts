/** Runtime limits for the notifications feature, read from env with safe defaults. */

function positiveInt(raw: string | undefined, fallback: number): number {
    const n = raw ? Number.parseInt(raw, 10) : NaN
    return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Max data rows per uploaded subscriber list (`NOTIFY_IMPORT_MAX_ROWS`, default 10,000). */
export function getImportMaxRows(): number {
    return positiveInt(process.env.NOTIFY_IMPORT_MAX_ROWS, 10_000)
}

/** Upload size limit in bytes (`MAX_FILE_SIZE_MB`, default 50, shared with other upload handlers). */
export function getImportMaxBytes(): number {
    return positiveInt(process.env.MAX_FILE_SIZE_MB, 50) * 1024 * 1024
}

/** Consent wording versions recorded on subscribers. Bump when the wording changes. */
export const CONSENT_VERSIONS = {
    import: "import-invite-v1",
    admin_manual: "admin-manual-v1",
    public_form: "public-form-v1",
    orcid_account: "orcid-account-v1",
} as const

export const SITE_NAME = "DigitoPub"

/** Absolute base URL for links in emails (`NEXT_PUBLIC_APP_URL`, no trailing slash). */
export function getAppBaseUrl(): string {
    return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")
}

/** Unconfirmed (pending) subscribers are purged after this many days (#199). */
export const PENDING_SUBSCRIBER_RETENTION_DAYS = 90
