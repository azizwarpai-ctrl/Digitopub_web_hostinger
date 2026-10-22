import { createHash } from "node:crypto"

/** sha256 hex of the trimmed, lowercased email; null for empty input. */
export function emailHash(email: string | null | undefined): string | null {
    if (!email) return null
    return createHash("sha256").update(email.trim().toLowerCase()).digest("hex")
}
