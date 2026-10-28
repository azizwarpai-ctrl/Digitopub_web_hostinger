/**
 * Values for the journal invitation (#231): the "Dr." greeting, the journal's
 * short name and scope sentence, and the expiry date written in full.
 */

import { getAppBaseUrl } from "./config"

/** The invitation's journal, as loaded for a campaign. */
export interface InvitationJournal {
    title: string
    ojs_path: string | null
    invitation_scope: string | null
}

// A title only when followed by a dot, space or the end (\b is ASCII-only: "Drمحمد" is a name).
const TITLE_PREFIX = /^\s*(?:(?:dr|prof|professor|doctor)(?=[.\s]|$)\.?\s*)+/i

/** "Dr. <name>" with any existing Dr/Prof prefix removed, or "Colleague" without a name. */
export function salutationName(name: string | null | undefined): string {
    const bare = (name ?? "").replace(TITLE_PREFIX, "").trim()
    return bare ? `Dr. ${bare}` : "Colleague"
}

/** A date written in full in UTC, e.g. "23 November 2026". */
export function longDate(d: Date): string {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}

/** Journal variables of the invitation; the scope sentence is empty when the journal has none. */
export function journalInvitationVars(journal: InvitationJournal): Record<string, string> {
    const scope = (journal.invitation_scope ?? "").trim().replace(/[.\s]+$/, "")
    return {
        journal_title: journal.title,
        journal_short: (journal.ojs_path ?? "").toUpperCase() || journal.title,
        journal_scope_sentence: scope ? `, ${scope}` : "",
        journal_url: journal.ojs_path ? `${getAppBaseUrl()}/journals/${encodeURIComponent(journal.ojs_path)}` : getAppBaseUrl(),
    }
}
