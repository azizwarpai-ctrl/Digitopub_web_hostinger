/**
 * Authors of one OJS journal, for inviting them to that journal's
 * publication alerts (#217). Read-only: one SELECT, nothing is written to
 * OJS. People found here are only staged as an import; they receive the
 * double opt-in invitation and become subscribers only if they confirm.
 */

import type { RowDataPacket } from "mysql2/promise"

import { ojsQuery } from "./ojs-client"

export interface OjsJournalAuthor {
    name: string | null
    email: string
}

interface AuthorRow extends RowDataPacket {
    email: string
    givenName: string | null
    familyName: string | null
}

/**
 * Distinct authors (by email) of submitted manuscripts in OJS journal
 * `contextId`, most recent first. Names come from the `author_settings` EAV.
 */
export async function getOjsAuthorsForJournal(contextId: number, limit: number): Promise<OjsJournalAuthor[]> {
    const rows = await ojsQuery<AuthorRow>(
        `SELECT
            a.email AS email,
            MAX(gs.setting_value) AS givenName,
            MAX(fs.setting_value) AS familyName
        FROM authors a
        JOIN publications p ON p.publication_id = a.publication_id
        JOIN submissions s ON s.submission_id = p.submission_id
        LEFT JOIN author_settings gs ON gs.author_id = a.author_id AND gs.setting_name = 'givenName'
        LEFT JOIN author_settings fs ON fs.author_id = a.author_id AND fs.setting_name = 'familyName'
        WHERE s.context_id = ? AND s.date_submitted IS NOT NULL AND a.email IS NOT NULL AND a.email != ''
        GROUP BY a.email
        ORDER BY MAX(s.date_submitted) DESC
        LIMIT ?`,
        [contextId, limit],
    )
    return rows.map((r) => {
        const name = [r.givenName, r.familyName].filter((p): p is string => !!p && p.trim().length > 0).join(" ").trim()
        return { email: r.email.trim(), name: name || null }
    })
}
