/**
 * Server-built repeating blocks for notification emails. Every value from OJS
 * is escaped here, so the result is safe to insert raw via {{{toc_html}}} /
 * {{{articles_html}}} (see RAW_BLOCK_VARIABLES). Each block also has a
 * plain-text twin for the text part.
 */

import { escapeHtml } from "@/src/lib/email/renderer"

import type { ArticleSnapshot, IssueSnapshot } from "../types/notification-types"

/** The only variables a notification template may insert as raw HTML. */
export const RAW_BLOCK_VARIABLES = ["toc_html", "articles_html"] as const

type TocArticle = IssueSnapshot["articles"][number]

const doiUrl = (doi: string) => `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
const authorsLine = (a: { authors: Array<{ name: string }> }) => a.authors.map((x) => x.name).join(", ")

/** Absolute http(s) URLs only; anything else becomes "#". */
function safeUrl(url: string): string {
    return /^https?:\/\//i.test(url) ? url : "#"
}

function articleRowHtml(a: TocArticle | ArticleSnapshot, extra?: string): string {
    const meta = [
        authorsLine(a) && `<span style="color:#555">${escapeHtml(authorsLine(a))}</span>`,
        a.doi && `<a href="${escapeHtml(doiUrl(a.doi))}" style="color:#1F3A5F">doi:${escapeHtml(a.doi)}</a>`,
        a.is_open_access && `<span style="color:#2e7d32;font-weight:600">Open Access</span>`,
    ].filter(Boolean).join(" · ")
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #E3DED3">`
        + `<a href="${escapeHtml(safeUrl(a.url))}" style="color:#1F3A5F;font-family:Georgia,serif;font-size:16px;text-decoration:none">${escapeHtml(a.title)}</a>`
        + (meta ? `<div style="font-size:13px;margin-top:4px">${meta}</div>` : "")
        + (extra ?? "")
        + `</td></tr>`
}

function sectionHeadingHtml(title: string): string {
    return `<tr><td style="padding:18px 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#555">${escapeHtml(title)}</td></tr>`
}

const table = (rows: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`

/** Issue table of contents grouped by section, in OJS order. */
export function buildToc(issue: IssueSnapshot): { html: string; text: string } {
    let html = ""
    let text = ""
    let section: string | null | undefined
    for (const a of issue.articles) {
        if (a.section !== section) {
            section = a.section
            if (section) {
                html += sectionHeadingHtml(section)
                text += `\n${section.toUpperCase()}\n`
            }
        }
        html += articleRowHtml(a)
        text += `- ${a.title}${authorsLine(a) ? `\n  ${authorsLine(a)}` : ""}${a.doi ? `\n  ${doiUrl(a.doi)}` : ""}\n  ${a.url}\n`
    }
    return { html: table(html), text: text.trim() }
}

/** Digest articles grouped by discipline name; an article appears once, under its first discipline. */
export function buildArticles(
    articles: Array<{ snapshot: ArticleSnapshot; disciplineName: string | null }>,
): { html: string; text: string } {
    const groups = new Map<string, ArticleSnapshot[]>()
    for (const { snapshot, disciplineName } of articles) {
        const key = disciplineName ?? "Other research"
        groups.set(key, [...(groups.get(key) ?? []), snapshot])
    }
    let html = ""
    let text = ""
    for (const [name, list] of groups) {
        html += sectionHeadingHtml(name)
        text += `\n${name.toUpperCase()}\n`
        for (const a of list) {
            const excerpt = a.abstract_excerpt
                ? `<div style="font-size:14px;color:#2B2B2B;margin-top:6px;line-height:1.5">${escapeHtml(a.abstract_excerpt)}</div>`
                : ""
            const journal = `<div style="font-size:13px;color:#555;margin-top:2px;font-style:italic">${escapeHtml(a.journal_title)}</div>`
            html += articleRowHtml(a, journal + excerpt)
            text += `- ${a.title}\n  ${a.journal_title}${authorsLine(a) ? `\n  ${authorsLine(a)}` : ""}${a.abstract_excerpt ? `\n  ${a.abstract_excerpt}` : ""}\n  ${a.url}\n`
        }
    }
    return { html: table(html), text: text.trim() }
}
