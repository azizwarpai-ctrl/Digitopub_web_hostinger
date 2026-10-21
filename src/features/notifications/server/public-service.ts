/**
 * Public side of publication notifications (#199): double opt-in sign-up,
 * confirmation, the token-authenticated preference centre, one-click
 * unsubscribe, and ORCID account linking.
 *
 * Callers must answer sign-ups generically: `requestSubscription` returns an
 * email job or null, and the route responds identically either way.
 */

import { Prisma } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import { emailHash } from "@/src/lib/email-hash"
import { sendTemplateEmail } from "@/src/lib/email/service"
import {
    CONFIRM_TOKEN_TTL_SECONDS,
    hashNotifyToken,
    signNotifyToken,
    verifyNotifyToken,
} from "@/src/lib/notification-token"

import type { ArticleFrequency, SubscriberSource } from "../constants"
import { CONSENT_VERSIONS, SITE_NAME, getAppBaseUrl } from "./config"
import { NOTIFICATION_TEMPLATE_KEYS, ensureNotificationTemplate, type TemplateKey } from "./templates"
import { getSettings } from "./admin-config-service"

type Subscriber = Prisma.NotificationSubscriberGetPayload<object>

export interface EmailJob {
    template: TemplateKey
    to: string
    variables: Record<string, string>
}

export interface SubscribeRequest {
    email: string
    name?: string | null
    journal_ids: string[]
    discipline_ids: string[]
    source: Extract<SubscriberSource, "public_form" | "orcid_account">
    orcid?: string | null
    ipHash?: string | null
}

// ─── Links ────────────────────────────────────────────────────────────

function link(path: string, token: string): string {
    return `${getAppBaseUrl()}${path}?token=${encodeURIComponent(token)}`
}

export function manageUrl(s: Pick<Subscriber, "id" | "token_version">): string {
    return link("/notifications/manage", signNotifyToken({ purpose: "manage", subscriberId: s.id, version: s.token_version }))
}

export function unsubscribeUrl(s: Pick<Subscriber, "id" | "token_version">): string {
    return link("/notifications/unsubscribe", signNotifyToken({ purpose: "unsub", subscriberId: s.id, version: s.token_version }))
}

function lifecycleVariables(s: Subscriber): Record<string, string> {
    return {
        recipient_name: s.name || "Colleague",
        site_name: SITE_NAME,
        manage_url: manageUrl(s),
        unsubscribe_url: unsubscribeUrl(s),
    }
}

/** Sends a lifecycle email; failures are logged, never thrown (callers run it after responding). */
export async function deliverEmail(job: EmailJob): Promise<void> {
    try {
        await ensureNotificationTemplate(prisma, job.template)
        const result = await sendTemplateEmail({ templateName: job.template, to: job.to, variables: job.variables })
        if (!result.success) console.error(`[Notifications] ${job.template} not sent: ${result.error}`)
    } catch (e) {
        console.error(`[Notifications] ${job.template} failed:`, e instanceof Error ? e.message : e)
    }
}

// ─── Options for sign-up forms ────────────────────────────────────────

export async function getPublicOptions() {
    const [journals, disciplines] = await Promise.all([
        prisma.journal.findMany({
            where: { status: "active" },
            select: { id: true, title: true },
            orderBy: { title: "asc" },
        }),
        prisma.discipline.findMany({
            where: { is_active: true },
            select: { id: true, name: true, parent_id: true },
            orderBy: [{ sort_order: "asc" }, { name: "asc" }],
        }),
    ])
    return { journals, disciplines }
}

/** Keeps only ids that exist and are active, so a forged id cannot hit an FK error. */
async function validFollows(journalIds: string[], disciplineIds: string[]) {
    const [journals, disciplines] = await Promise.all([
        journalIds.length
            ? prisma.journal.findMany({ where: { id: { in: journalIds.map(BigInt) }, status: "active" }, select: { id: true, title: true } })
            : [],
        disciplineIds.length
            ? prisma.discipline.findMany({ where: { id: { in: disciplineIds.map(BigInt) }, is_active: true }, select: { id: true, name: true } })
            : [],
    ])
    return { journals, disciplines }
}

async function replaceFollows(
    tx: Prisma.TransactionClient,
    subscriberId: bigint,
    journalIds: bigint[],
    disciplineIds: bigint[],
) {
    await tx.subscriberJournal.deleteMany({ where: { subscriber_id: subscriberId } })
    await tx.subscriberDiscipline.deleteMany({ where: { subscriber_id: subscriberId } })
    if (journalIds.length) {
        await tx.subscriberJournal.createMany({ data: journalIds.map((journal_id) => ({ subscriber_id: subscriberId, journal_id })) })
    }
    if (disciplineIds.length) {
        await tx.subscriberDiscipline.createMany({ data: disciplineIds.map((discipline_id) => ({ subscriber_id: subscriberId, discipline_id })) })
    }
}

// ─── Sign-up ──────────────────────────────────────────────────────────

/**
 * Creates or refreshes a pending subscriber and returns the confirmation
 * email to send, or null when nothing must happen:
 * - active: no-op, so a third party cannot change someone's follows;
 * - bounced / complained: suppressed, never re-invited.
 * An unsubscribed address starts a new consent cycle: `token_version` is
 * bumped, so every older link stops working.
 */
export async function requestSubscription(input: SubscribeRequest): Promise<EmailJob | null> {
    const email = input.email.trim().toLowerCase()
    const existing = await prisma.notificationSubscriber.findUnique({ where: { email } })
    if (existing && existing.status !== "pending" && existing.status !== "unsubscribed") return null

    const follows = await validFollows(input.journal_ids, input.discipline_ids)
    // Public sign-ups record the admin-set wording version (bumped when the consent text changes).
    const consent = input.source === "public_form" ? (await getSettings()).consent_text_version : CONSENT_VERSIONS[input.source]
    const expiresAt = new Date(Date.now() + CONFIRM_TOKEN_TTL_SECONDS * 1000)

    const subscriber = await prisma.$transaction(async (tx) => {
        const base = {
            status: "pending",
            consent_text_version: consent,
            consent_ip_hash: input.ipHash ?? null,
            confirm_expires_at: expiresAt,
        }
        let row: Subscriber
        if (existing) {
            row = await tx.notificationSubscriber.update({
                where: { id: existing.id },
                data: {
                    ...base,
                    name: input.name || existing.name,
                    orcid: existing.orcid ?? input.orcid ?? null,
                    unsubscribed_at: null,
                    ...(existing.status === "unsubscribed" ? { token_version: { increment: 1 }, source: input.source } : {}),
                },
            })
        } else {
            row = await tx.notificationSubscriber.create({
                data: {
                    ...base,
                    email,
                    email_hash: emailHash(email)!,
                    name: input.name || null,
                    orcid: input.orcid ?? null,
                    source: input.source,
                },
            })
        }
        // A bare re-request (e.g. "send a new link" on an expired page) keeps what was chosen before.
        const keepFollows = existing && !input.journal_ids.length && !input.discipline_ids.length
        if (!keepFollows) {
            await replaceFollows(tx, row.id, follows.journals.map((j) => j.id), follows.disciplines.map((d) => d.id))
        }

        // The token embeds the final id and version, so it is signed last.
        const token = signNotifyToken({ purpose: "confirm", subscriberId: row.id, version: row.token_version })
        await tx.notificationSubscriber.update({ where: { id: row.id }, data: { confirm_token_hash: hashNotifyToken(token) } })
        return { row, token, keepFollows }
    })

    // Summarise what is actually stored, which differs from the request when follows were kept.
    const summary = subscriber.keepFollows
        ? {
            journals: (await prisma.subscriberJournal.findMany({
                where: { subscriber_id: subscriber.row.id },
                select: { journal: { select: { title: true } } },
            })).map((r) => r.journal.title),
            disciplines: (await prisma.subscriberDiscipline.findMany({
                where: { subscriber_id: subscriber.row.id },
                select: { discipline: { select: { name: true } } },
            })).map((r) => r.discipline.name),
        }
        : { journals: follows.journals.map((j) => j.title), disciplines: follows.disciplines.map((d) => d.name) }

    return {
        template: NOTIFICATION_TEMPLATE_KEYS.subscriptionConfirm,
        to: email,
        variables: {
            recipient_name: subscriber.row.name || "Colleague",
            site_name: SITE_NAME,
            confirm_url: link("/notifications/confirm", subscriber.token),
            expires_on: expiresAt.toISOString().slice(0, 10),
            selected_journals: summary.journals.join(", ") || "None selected",
            selected_disciplines: summary.disciplines.join(", ") || "None selected",
        },
    }
}

// ─── Confirmation ─────────────────────────────────────────────────────

export type ConfirmOutcome =
    | { status: "confirmed"; welcome: EmailJob; manageUrl: string }
    | { status: "already_active"; manageUrl: string }
    | { status: "expired" }
    | { status: "invalid" }

export async function confirmSubscription(token: string): Promise<ConfirmOutcome> {
    const verified = verifyNotifyToken(token, "confirm")
    if (!verified) {
        // Signature-valid but past its expiry: offer a new link instead of "invalid".
        return verifyNotifyToken(token, "confirm", 0) ? { status: "expired" } : { status: "invalid" }
    }

    const sub = await prisma.notificationSubscriber.findUnique({ where: { id: verified.subscriberId } })
    if (!sub || sub.token_version !== verified.version) return { status: "invalid" }
    if (sub.status === "active") return { status: "already_active", manageUrl: manageUrl(sub) }
    if (sub.status !== "pending" || sub.confirm_token_hash !== hashNotifyToken(token)) return { status: "invalid" }

    // Guarded update: a concurrent second click (or a superseded token) changes nothing.
    const { count } = await prisma.notificationSubscriber.updateMany({
        where: { id: sub.id, status: "pending", confirm_token_hash: hashNotifyToken(token) },
        data: { status: "active", confirmed_at: new Date(), confirm_token_hash: null, confirm_expires_at: null },
    })
    if (count === 0) {
        const now = await prisma.notificationSubscriber.findUnique({ where: { id: sub.id } })
        return now?.status === "active" ? { status: "already_active", manageUrl: manageUrl(now) } : { status: "invalid" }
    }

    return {
        status: "confirmed",
        manageUrl: manageUrl(sub),
        welcome: { template: NOTIFICATION_TEMPLATE_KEYS.welcome, to: sub.email, variables: lifecycleVariables(sub) },
    }
}

// ─── Preference centre ────────────────────────────────────────────────

async function subscriberFromToken(token: string, purposes: Array<"manage" | "unsub">): Promise<Subscriber | null> {
    for (const purpose of purposes) {
        const verified = verifyNotifyToken(token, purpose)
        if (!verified) continue
        const sub = await prisma.notificationSubscriber.findUnique({ where: { id: verified.subscriberId } })
        return sub && sub.token_version === verified.version ? sub : null
    }
    return null
}

export async function getPreferences(token: string) {
    const sub = await subscriberFromToken(token, ["manage"])
    if (!sub) return null
    const [journals, disciplines, options] = await Promise.all([
        prisma.subscriberJournal.findMany({ where: { subscriber_id: sub.id }, select: { journal_id: true } }),
        prisma.subscriberDiscipline.findMany({ where: { subscriber_id: sub.id }, select: { discipline_id: true } }),
        getPublicOptions(),
    ])
    return {
        subscriber: {
            email: sub.email,
            name: sub.name,
            status: sub.status,
            article_frequency: sub.article_frequency as ArticleFrequency,
            issue_alerts: sub.issue_alerts,
            journal_ids: journals.map((j) => j.journal_id),
            discipline_ids: disciplines.map((d) => d.discipline_id),
        },
        options,
    }
}

export interface PreferencesInput {
    journal_ids: string[]
    discipline_ids: string[]
    article_frequency: ArticleFrequency
    issue_alerts: boolean
    /** Re-activate an address the owner unsubscribed earlier (proved by the emailed link). */
    resume?: boolean
}

export type PreferencesOutcome = { status: "saved"; email: EmailJob | null } | { status: "invalid" } | { status: "suppressed" }

export async function updatePreferences(token: string, input: PreferencesInput): Promise<PreferencesOutcome> {
    const sub = await subscriberFromToken(token, ["manage"])
    if (!sub) return { status: "invalid" }
    if (sub.status === "bounced" || sub.status === "complained") return { status: "suppressed" }

    const follows = await validFollows(input.journal_ids, input.discipline_ids)
    const resume = sub.status === "unsubscribed" && input.resume === true
    await prisma.$transaction(async (tx) => {
        await tx.notificationSubscriber.update({
            where: { id: sub.id },
            data: {
                article_frequency: input.article_frequency,
                issue_alerts: input.issue_alerts,
                ...(resume ? { status: "active", unsubscribed_at: null } : {}),
            },
        })
        await replaceFollows(tx, sub.id, follows.journals.map((j) => j.id), follows.disciplines.map((d) => d.id))
    })

    // Only addresses that receive alerts get the change notice.
    const notify = sub.status === "active" || resume
    return {
        status: "saved",
        email: notify
            ? { template: NOTIFICATION_TEMPLATE_KEYS.preferencesUpdated, to: sub.email, variables: lifecycleVariables(sub) }
            : null,
    }
}

// ─── Unsubscribe ──────────────────────────────────────────────────────

/** Idempotent. Accepts unsub and manage tokens. Suppressed statuses are left as they are. */
export async function unsubscribe(token: string): Promise<"ok" | "invalid"> {
    const sub = await subscriberFromToken(token, ["unsub", "manage"])
    if (!sub) return "invalid"
    if (sub.status === "active" || sub.status === "pending") {
        await prisma.notificationSubscriber.update({
            where: { id: sub.id },
            data: { status: "unsubscribed", unsubscribed_at: new Date(), confirm_token_hash: null, confirm_expires_at: null },
        })
    }
    return "ok"
}

// ─── ORCID account ────────────────────────────────────────────────────

interface IdentityRef {
    orcid: string
    email_hash: string | null
}

async function findForIdentity(identity: IdentityRef): Promise<Subscriber | null> {
    const byOrcid = await prisma.notificationSubscriber.findFirst({ where: { orcid: identity.orcid }, orderBy: { id: "asc" } })
    if (byOrcid) return byOrcid
    if (!identity.email_hash) return null
    return prisma.notificationSubscriber.findFirst({ where: { email_hash: identity.email_hash, orcid: null } })
}

export async function getAccountNotifications(identity: IdentityRef) {
    const sub = await findForIdentity(identity)
    if (!sub) return { state: "none" as const }
    const summary = { status: sub.status, article_frequency: sub.article_frequency, issue_alerts: sub.issue_alerts }
    if (sub.orcid !== identity.orcid) return { state: "matchable" as const, subscriber: summary }
    return { state: "linked" as const, subscriber: summary, manage_url: manageUrl(sub) }
}

/** Links the subscriber whose email matches the ORCID identity's verified OJS email. */
export async function linkIdentity(identity: IdentityRef): Promise<boolean> {
    if (!identity.email_hash) return false
    const { count } = await prisma.notificationSubscriber.updateMany({
        where: { email_hash: identity.email_hash, orcid: null },
        data: { orcid: identity.orcid },
    })
    return count > 0
}
