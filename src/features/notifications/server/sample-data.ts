/**
 * Realistic fixture variables for previewing notification templates in the
 * admin editor (#202). Blocks are built with the same escaping code paths
 * as real sends.
 */

import type { ArticleSnapshot, IssueSnapshot } from "../types/notification-types"
import { SITE_NAME, getAppBaseUrl } from "./config"
import { buildArticles, buildToc } from "./render-blocks"

const base = () => getAppBaseUrl()

const ARTICLES: ArticleSnapshot[] = [
    ["Long-term stability of clear aligner therapy: a 5-year cohort study", "Orthodontics", ["Maria Rossi", "Ahmed Saleh"], "10.5555/jor.2026.0142"],
    ["Bioceramic sealers in single-visit root canal treatment: a randomised trial", "Endodontics", ["Li Wei", "Sara Novak"], "10.5555/jor.2026.0143"],
    ["Peri-implantitis risk factors in smokers: a systematic review", "Periodontology", ["John Carter"], null],
    ["Intraoral scanning accuracy for full-arch implant impressions", "Digital Dentistry", ["Aiko Tanaka", "Omar Haddad"], "10.5555/jor.2026.0145"],
    ["Fluoride varnish programmes and early childhood caries in rural schools", "Dental Public Health", ["Grace Mensah"], "10.5555/jor.2026.0146"],
].map(([title, section, authors, doi], i) => ({
    title: title as string,
    authors: (authors as string[]).map((name) => ({ name })),
    doi: doi as string | null,
    abstract_excerpt: "Background: this study evaluates outcomes in a multicentre sample using standardised clinical and radiographic measures. Results indicate a clinically relevant improvement over the comparison group, with implications for practice…",
    keywords: [],
    section: section as string,
    section_id: null,
    is_open_access: i % 2 === 0,
    journal_title: "Journal of Orthodontic Research",
    journal_id: null,
    issue_id: 12,
    publication_id: 140 + i,
    url: `${base()}/journals/1/articles/${140 + i}`,
}))

const ISSUE: IssueSnapshot = {
    title: "Advances in Digital Orthodontics",
    volume: 12,
    number: "3",
    year: 2026,
    cover_url: null,
    journal_title: "Journal of Orthodontic Research",
    journal_issn: "2345-6789",
    journal_id: null,
    url: `${base()}/journals/1/issues/12/3`,
    articles: ARTICLES.map(({ title, authors, doi, section, is_open_access, url }) => ({ title, authors, doi, section, is_open_access, url })),
}

/** Sample variables for a template name; non-notification templates get the common set only. */
export function sampleVariables(templateName: string): Record<string, string> {
    const common: Record<string, string> = {
        recipient_name: "Dr Jane Doe",
        site_name: SITE_NAME,
        site_url: base(),
        manage_url: `${base()}/notifications/manage?token=sample`,
        unsubscribe_url: `${base()}/notifications/unsubscribe?token=sample`,
        privacy_url: `${base()}/privacy`,
        publisher_address: "DigitoPub, 1 Example Street, 00000 City, Country",
        preheader: "Sample preview",
    }
    const toc = buildToc(ISSUE)
    const digest = buildArticles(ARTICLES.map((a) => ({ snapshot: a, disciplineName: a.section })))
    switch (templateName) {
        case "notify_new_issue":
            return {
                ...common,
                journal_title: ISSUE.journal_title, journal_issn: ISSUE.journal_issn ?? "", journal_url: `${base()}/journals/1`,
                volume: "12", number: "3", year: "2026", issue_title: ISSUE.title ?? "", cover_url: "", issue_url: ISSUE.url,
                editor_note: "This issue gathers recent work on digital workflows in orthodontic diagnosis and treatment.",
                toc_html: toc.html, toc_text: toc.text,
            }
        case "notify_weekly_digest":
        case "notify_daily_digest":
            return {
                ...common,
                count: String(ARTICLES.length), top_disciplines: "Orthodontics and Endodontics", week_start: "2026-10-19", date: "2026-10-21",
                articles_html: digest.html, articles_text: digest.text,
            }
        case "notify_subscription_confirm":
        case "notify_import_invitation":
            return {
                ...common,
                confirm_url: `${base()}/notifications/confirm?token=sample`, expires_on: "2026-11-20", inviter_org: SITE_NAME,
                primary_discipline: "Orthodontics", selected_journals: ISSUE.journal_title, selected_disciplines: "Orthodontics, Endodontics",
            }
        default:
            return common
    }
}
