/**
 * Server-built repeating blocks for notification emails. Every value from OJS
 * is escaped here, so the result is safe to insert raw via {{{toc_html}}} /
 * {{{articles_html}}} (see RAW_BLOCK_VARIABLES). Each block also has a
 * plain-text twin for the text part.
 */

import { escapeHtml } from "@/src/lib/email/renderer"

import type { ArticleSnapshot, IssueSnapshot } from "../types/notification-types"
import { EMAIL_STYLES, type EmailStyle } from "./email-styles"

const CLASSIC = EMAIL_STYLES.classic

/** The only variables a notification template may insert as raw HTML. */
export const RAW_BLOCK_VARIABLES = ["toc_html", "articles_html", "editor_note_html", "message_html"] as const

/** The editor's note as a quoted block, or "" when there is none (templates have no conditionals). */
export function buildEditorNote(note: string | null | undefined, style: EmailStyle = CLASSIC): string {
    const text = note?.trim()
    if (!text) return ""
    return `<div style="margin:0 0 8px;padding:14px 18px;border-left:3px solid ${style.colors.accent};background:${style.colors.noteBg};font-family:${style.fonts.title};font-size:15px;line-height:1.6;color:${style.colors.ink}">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`
}

/**
 * An admin's plain-text message as email paragraphs: escaped, blank lines
 * start a new paragraph, single line breaks are kept, and http(s) links
 * become clickable. Safe to insert raw via {{{message_html}}}.
 */
export function buildMessage(message: string | null | undefined, style: EmailStyle = CLASSIC): { html: string; text: string } {
    const text = (message ?? "").replace(/\r\n?/g, "\n").trim()
    if (!text) return { html: "", text: "" }
    // Runs on escaped text: a URL ends before whitespace or "<", and trailing punctuation stays outside the link.
    const link = (escaped: string) =>
        escaped.replace(/https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"]/g, (url) => `<a href="${url}" style="color:${style.colors.accent}">${url}</a>`)
    const html = text
        .split(/\n{2,}/)
        .map((para) => `<p class="ink" style="margin:0 0 16px;font-family:${style.fonts.body};font-size:16px;line-height:1.6;color:${style.colors.ink}">${link(escapeHtml(para.trim())).replace(/\n/g, "<br>")}</p>`)
        .join("\n")
    return { html, text }
}

type TocArticle = IssueSnapshot["articles"][number]

const doiUrl = (doi: string) => `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
const authorsLine = (a: { authors: Array<{ name: string }> }) => a.authors.map((x) => x.name).join(", ")

/** Absolute http(s) URLs only; anything else becomes "#". */
function safeUrl(url: string): string {
    return /^https?:\/\//i.test(url) ? url : "#"
}

function articleRowHtml(a: TocArticle | ArticleSnapshot, style: EmailStyle, extra?: string): string {
    const c = style.colors
    const meta = [
        authorsLine(a) && `<span style="color:${c.meta}">${escapeHtml(authorsLine(a))}</span>`,
        a.doi && `<a href="${escapeHtml(doiUrl(a.doi))}" style="color:${c.accent}">doi:${escapeHtml(a.doi)}</a>`,
        a.is_open_access && `<span style="color:${c.openAccess};font-weight:600">Open Access</span>`,
    ].filter(Boolean).join(" · ")
    return `<tr><td style="padding:10px 0;border-bottom:1px solid ${c.rule}">`
        + `<a href="${escapeHtml(safeUrl(a.url))}" style="color:${c.accent};font-family:${style.fonts.title};font-size:16px;text-decoration:none">${escapeHtml(a.title)}</a>`
        + (meta ? `<div style="font-size:13px;margin-top:4px">${meta}</div>` : "")
        + (extra ?? "")
        + `</td></tr>`
}

function sectionHeadingHtml(title: string, style: EmailStyle): string {
    return `<tr><td style="padding:18px 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${style.colors.meta}">${escapeHtml(title)}</td></tr>`
}

const table = (rows: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`

/** Issue table of contents grouped by section, in OJS order. */
export function buildToc(issue: IssueSnapshot, style: EmailStyle = CLASSIC): { html: string; text: string } {
    let html = ""
    let text = ""
    let section: string | null | undefined
    for (const a of issue.articles) {
        if (a.section !== section) {
            section = a.section
            if (section) {
                html += sectionHeadingHtml(section, style)
                text += `\n${section.toUpperCase()}\n`
            }
        }
        html += articleRowHtml(a, style)
        text += `- ${a.title}${authorsLine(a) ? `\n  ${authorsLine(a)}` : ""}${a.doi ? `\n  ${doiUrl(a.doi)}` : ""}\n  ${a.url}\n`
    }
    return { html: table(html), text: text.trim() }
}

/** Digest articles grouped by discipline name; an article appears once, under its first discipline. */
export function buildArticles(
    articles: Array<{ snapshot: ArticleSnapshot; disciplineName: string | null }>,
    style: EmailStyle = CLASSIC,
): { html: string; text: string } {
    const groups = new Map<string, ArticleSnapshot[]>()
    for (const { snapshot, disciplineName } of articles) {
        const key = disciplineName ?? "Other research"
        groups.set(key, [...(groups.get(key) ?? []), snapshot])
    }
    let html = ""
    let text = ""
    for (const [name, list] of groups) {
        html += sectionHeadingHtml(name, style)
        text += `\n${name.toUpperCase()}\n`
        for (const a of list) {
            const excerpt = a.abstract_excerpt
                ? `<div style="font-size:14px;color:${style.colors.ink};margin-top:6px;line-height:1.5">${escapeHtml(a.abstract_excerpt)}</div>`
                : ""
            const journal = `<div style="font-size:13px;color:${style.colors.meta};margin-top:2px;font-style:italic">${escapeHtml(a.journal_title)}</div>`
            html += articleRowHtml(a, style, journal + excerpt)
            text += `- ${a.title}\n  ${a.journal_title}${authorsLine(a) ? `\n  ${authorsLine(a)}` : ""}${a.abstract_excerpt ? `\n  ${a.abstract_excerpt}` : ""}\n  ${a.url}\n`
        }
    }
    return { html: table(html), text: text.trim() }
}
