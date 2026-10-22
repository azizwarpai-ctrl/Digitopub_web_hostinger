/**
 * Builds one recipient's message for a campaign (#201): variables from the
 * publication snapshots, escaped HTML blocks, the plain-text part, and the
 * bulk-mail headers (RFC 8058 one-click List-Unsubscribe).
 */

import type { EmailTemplate, NotificationCampaign, PublicationEvent } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import { extractAllVariables, renderHtmlTemplate, renderTemplate } from "@/src/lib/email/renderer"
import type { NotificationMessage } from "@/src/lib/email/notification-transport"
import { CONFIRM_TOKEN_TTL_SECONDS, hashNotifyToken, signNotifyToken } from "@/src/lib/notification-token"

import type { ArticleSnapshot, CampaignPayload, IssueSnapshot } from "../types/notification-types"
import { SITE_NAME, getAppBaseUrl } from "./config"
import { manageUrl } from "./public-service"
import { RAW_BLOCK_VARIABLES, buildArticles, buildToc } from "./render-blocks"
import { resolveRecipients, type AudienceSubscriber, type RuleLike } from "./resolve-recipients"

export interface ComposeContext {
    campaign: NotificationCampaign
    template: EmailTemplate
    /** Campaign events by id (string), minus any the admin excluded. */
    events: Map<string, PublicationEvent>
    rules: RuleLike[]
    disciplineNames: Map<string, string>
}

export interface ComposeSubscriber extends AudienceSubscriber {
    email: string
    name: string | null
    token_version: number
}

/** Loads everything a send run needs once per campaign. */
export async function loadComposeContext(campaign: NotificationCampaign, rules: RuleLike[]): Promise<ComposeContext> {
    const payload = campaign.payload as unknown as CampaignPayload
    const excluded = new Set(payload.excluded_event_ids ?? [])
    const ids = (payload.event_ids ?? []).filter((id) => !excluded.has(id)).map(BigInt)
    const [template, events, disciplines] = await Promise.all([
        prisma.emailTemplate.findUniqueOrThrow({ where: { id: campaign.template_id } }),
        ids.length ? prisma.publicationEvent.findMany({ where: { id: { in: ids } }, orderBy: { published_at: "asc" } }) : [],
        prisma.discipline.findMany({ select: { id: true, name: true } }),
    ])
    return {
        campaign,
        template,
        events: new Map(events.map((e) => [e.id.toString(), e])),
        rules,
        disciplineNames: new Map(disciplines.map((d) => [d.id.toString(), d.name])),
    }
}

function oneClickUrl(s: ComposeSubscriber): string {
    const token = signNotifyToken({ purpose: "unsub", subscriberId: s.id, version: s.token_version })
    return `${getAppBaseUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
}

export function bulkHeaders(s: ComposeSubscriber, campaignId: bigint): Record<string, string> {
    const entries = [`<${oneClickUrl(s)}>`]
    const mailto = process.env.NOTIFY_UNSUBSCRIBE_MAILTO
    if (mailto) entries.push(`<mailto:${mailto}?subject=unsubscribe>`)
    return {
        "List-Unsubscribe": entries.join(", "),
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "Precedence": "bulk",
        "X-DigitoPub-Campaign": campaignId.toString(),
    }
}

const isoDate = (d: string | Date) => new Date(d).toISOString().slice(0, 10)

/** Variables for one recipient, or null when the recipient has nothing to receive. */
async function variablesFor(ctx: ComposeContext, s: ComposeSubscriber): Promise<Record<string, string> | null> {
    const payload = ctx.campaign.payload as unknown as CampaignPayload
    const pageUnsubscribe = `${getAppBaseUrl()}/notifications/unsubscribe?token=${encodeURIComponent(
        signNotifyToken({ purpose: "unsub", subscriberId: s.id, version: s.token_version }),
    )}`
    const vars: Record<string, string> = {
        recipient_name: s.name || "Colleague",
        site_name: SITE_NAME,
        site_url: getAppBaseUrl(),
        manage_url: manageUrl(s),
        unsubscribe_url: pageUnsubscribe,
        privacy_url: `${getAppBaseUrl()}/privacy`,
        editor_note: payload.editor_note ?? "",
    }

    switch (ctx.campaign.type) {
        case "issue": {
            const ev = [...ctx.events.values()].find((e) => e.kind === "issue")
            if (!ev) return null
            const issue = ev.snapshot as unknown as IssueSnapshot
            const toc = buildToc(issue)
            return {
                ...vars,
                journal_title: issue.journal_title,
                journal_issn: issue.journal_issn ?? "",
                volume: issue.volume?.toString() ?? "",
                number: issue.number ?? "",
                year: issue.year?.toString() ?? "",
                issue_title: issue.title ?? "",
                issue_url: issue.url,
                journal_url: issue.url.replace(/\/issues\/.*$/, ""),
                cover_url: issue.cover_url ?? "",
                toc_html: toc.html,
                toc_text: toc.text,
                preheader: `${issue.journal_title}: new issue with ${issue.articles.length} article(s).`,
            }
        }
        case "digest_daily":
        case "digest_weekly": {
            const mine = [...ctx.events.values()].filter((e) => {
                const snap = e.snapshot as unknown as ArticleSnapshot
                const event = {
                    event_type: "article_digest" as const,
                    journal_id: snap.journal_id ? BigInt(snap.journal_id) : null,
                    discipline_ids: (e.discipline_ids as string[]).map(BigInt),
                }
                const frequency = ctx.campaign.type === "digest_daily" ? "daily" : "weekly"
                return resolveRecipients(event, [s], ctx.rules, { frequency }).length > 0
            })
            if (!mine.length) return null
            const shared = new Set(s.discipline_ids.map(String))
            const items = mine.map((e) => {
                const ids = e.discipline_ids as string[]
                const first = ids.find((id) => shared.has(id)) ?? ids[0]
                return { snapshot: e.snapshot as unknown as ArticleSnapshot, disciplineName: first ? ctx.disciplineNames.get(first) ?? null : null }
            })
            const counts = new Map<string, number>()
            for (const i of items) if (i.disciplineName) counts.set(i.disciplineName, (counts.get(i.disciplineName) ?? 0) + 1)
            const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n)
            const blocks = buildArticles(items)
            return {
                ...vars,
                count: String(items.length),
                top_disciplines: top.join(" and ") || "your fields",
                week_start: isoDate(payload.window?.from ?? ctx.campaign.created_at),
                date: isoDate(payload.window?.to ?? ctx.campaign.created_at),
                articles_html: blocks.html,
                articles_text: blocks.text,
                preheader: `${items.length} new article(s) in your fields.`,
            }
        }
        case "invitation": {
            if (s.status !== "pending") return null
            // A fresh single-use confirm link; it supersedes any earlier one.
            const token = signNotifyToken({ purpose: "confirm", subscriberId: s.id, version: s.token_version })
            const expires = new Date(Date.now() + CONFIRM_TOKEN_TTL_SECONDS * 1000)
            await prisma.notificationSubscriber.update({
                where: { id: s.id },
                data: { confirm_token_hash: hashNotifyToken(token), confirm_expires_at: expires },
            })
            const first = s.discipline_ids[0] ? ctx.disciplineNames.get(String(s.discipline_ids[0])) : undefined
            return {
                ...vars,
                confirm_url: `${getAppBaseUrl()}/notifications/confirm?token=${encodeURIComponent(token)}`,
                expires_on: isoDate(expires),
                inviter_org: SITE_NAME,
                primary_discipline: first ?? "your field",
                preheader: "Confirm to receive publication alerts. Nothing further is sent unless you do.",
            }
        }
        default:
            return vars
    }
}

export async function composeMessage(ctx: ComposeContext, s: ComposeSubscriber): Promise<NotificationMessage | null> {
    const vars = await variablesFor(ctx, s)
    if (!vars) return null
    const t = ctx.template
    const subjectTpl = ctx.campaign.subject_override || t.subject
    // Declared-but-unknown variables render empty instead of leaking "{{name}}".
    for (const key of extractAllVariables(t.html_content, subjectTpl, t.text_content ?? "")) vars[key] ??= ""
    return {
        to: s.email,
        subject: renderTemplate(subjectTpl, vars).replace(/[\r\n]+/g, " ").trim(),
        html: renderHtmlTemplate(t.html_content, vars, RAW_BLOCK_VARIABLES),
        text: t.text_content ? renderTemplate(t.text_content, vars) : vars.toc_text || vars.articles_text || "",
        headers: bulkHeaders(s, ctx.campaign.id),
    }
}
