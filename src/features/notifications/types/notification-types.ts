/** Shapes stored in JSON columns of the notification models. */

export interface SnapshotAuthor {
    name: string
}

/** `PublicationEvent.snapshot` for kind = "article". */
export interface ArticleSnapshot {
    title: string
    authors: SnapshotAuthor[]
    doi: string | null
    abstract_excerpt: string
    keywords: string[]
    section: string | null
    section_id: number | null
    is_open_access: boolean
    journal_title: string
    /** Local `journals.id` (string) or null when the journal is not synced yet. */
    journal_id: string | null
    issue_id: number | null
    publication_id: number
    url: string
}

/** `PublicationEvent.snapshot` for kind = "issue". */
export interface IssueSnapshot {
    title: string | null
    volume: number | null
    number: string | null
    year: number | null
    cover_url: string | null
    journal_title: string
    journal_issn: string | null
    journal_id: string | null
    url: string
    /** Table of contents in OJS section order. */
    articles: Array<Pick<ArticleSnapshot, "title" | "authors" | "doi" | "section" | "is_open_access" | "url">>
}

/** `NotificationCampaign.payload`. */
export interface CampaignPayload {
    event_ids: string[]
    /** Digest window (ISO), for digest campaigns. */
    window?: { from: string; to: string }
    /** Local journal id, for issue campaigns. */
    journal_id?: string | null
    editor_note?: string | null
    /** Event ids an admin removed from the draft before approving (Phase 6). */
    excluded_event_ids?: string[]
}
