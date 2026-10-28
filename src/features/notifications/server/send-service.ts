/**
 * Throttled delivery of approved campaigns (#201). `notification_deliveries`
 * is the queue; each cron run sends at most the remaining budget:
 * min(per run, hourly cap − sent in the last hour, daily cap − sent in the
 * last 24 h). Overlapping runs are excluded by the cron lock, and each
 * delivery is claimed with a guarded update so it can never be sent twice.
 */

import type { NotificationCampaign } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import type { NotificationTransport } from "@/src/lib/email/notification-transport"

import { MAX_SEND_ATTEMPTS, RETRY_BACKOFF_MS, getSendLimits, type SendLimits } from "./config"
import { loadRules } from "./audience"
import { composeMessage, loadComposeContext, type ComposeContext, type ComposeSubscriber } from "./compose"
import { estimateSchedule, windowResetsAt } from "./send-schedule"

const HOUR_MS = 60 * 60 * 1000
const ACTIVE_CAMPAIGN_STATUSES = ["queued", "sending"]

export interface SendRunResult {
    budget: number
    sent: number
    failed: number
    retried: number
    skipped: number
    remaining: number
    completed_campaigns: string[]
    promoted: number
}

/** Pure: how many messages this run may send. */
export function computeBudget(limits: SendLimits, sentLastHour: number, sentLastDay: number): number {
    return Math.max(0, Math.min(limits.perRun, limits.perHour - sentLastHour, limits.perDay - sentLastDay))
}

/** A queued delivery may be retried once its backoff (attempts × 10 min) has passed. */
function retryReady(attempts: number, updatedAt: Date, now: Date): boolean {
    return attempts === 0 || now.getTime() - updatedAt.getTime() >= attempts * RETRY_BACKOFF_MS
}

async function loadSubscriber(id: bigint): Promise<ComposeSubscriber | null> {
    const s = await prisma.notificationSubscriber.findUnique({
        where: { id },
        select: {
            id: true, email: true, name: true, status: true, token_version: true, issue_alerts: true, article_frequency: true,
            journals: { select: { journal_id: true } },
            disciplines: { select: { discipline_id: true } },
        },
    })
    if (!s) return null
    return {
        ...s,
        journal_ids: s.journals.map((j) => j.journal_id),
        discipline_ids: s.disciplines.map((d) => d.discipline_id),
    }
}

/** Remaining queued deliveries per campaign; campaigns with none left are finished. */
async function finishCampaigns(campaignIds: bigint[]): Promise<string[]> {
    const done: string[] = []
    for (const id of campaignIds) {
        const left = await prisma.notificationDelivery.count({ where: { campaign_id: id, status: "queued" } })
        if (left > 0) continue
        const { count } = await prisma.notificationCampaign.updateMany({
            where: { id, status: { in: ACTIVE_CAMPAIGN_STATUSES } },
            data: { status: "sent" },
        })
        if (count) done.push(id.toString())
    }
    return done
}

export async function runSendBatch(
    transport: NotificationTransport,
    opts: { now?: Date; limits?: SendLimits } = {},
): Promise<SendRunResult> {
    const now = opts.now ?? new Date()
    const limits = opts.limits ?? getSendLimits()

    // A retry can re-queue rows just after a run marked the campaign sent (#246): re-open it.
    await prisma.notificationCampaign.updateMany({
        where: { status: "sent", deliveries: { some: { status: "queued" } } },
        data: { status: "sending" },
    })

    // Scheduled campaigns whose time has come join the queue.
    const promoted = (await prisma.notificationCampaign.updateMany({
        where: { status: "scheduled", scheduled_at: { lte: now } },
        data: { status: "queued" },
    })).count

    const [sentLastHour, sentLastDay] = await Promise.all([
        prisma.notificationDelivery.count({ where: { status: "sent", sent_at: { gt: new Date(now.getTime() - HOUR_MS) } } }),
        prisma.notificationDelivery.count({ where: { status: "sent", sent_at: { gt: new Date(now.getTime() - 24 * HOUR_MS) } } }),
    ])
    const budget = computeBudget(limits, sentLastHour, sentLastDay)
    const result: SendRunResult = { budget, sent: 0, failed: 0, retried: 0, skipped: 0, remaining: 0, completed_campaigns: [], promoted }

    // Over-fetch so rows still in backoff do not starve the batch.
    const candidates = budget > 0
        ? await prisma.notificationDelivery.findMany({
            where: { status: "queued", campaign: { status: { in: ACTIVE_CAMPAIGN_STATUSES } } },
            orderBy: { id: "asc" },
            take: budget * 3,
        })
        : []
    const batch = candidates.filter((d) => retryReady(d.attempts, d.updated_at, now)).slice(0, budget)

    const rules = batch.length ? await loadRules() : []
    const contexts = new Map<string, ComposeContext>()
    const touched = new Set<bigint>()

    for (const d of batch) {
        const key = d.campaign_id.toString()
        let ctx = contexts.get(key)
        if (!ctx) {
            const campaign = await prisma.notificationCampaign.findUniqueOrThrow({ where: { id: d.campaign_id } })
            if (!ACTIVE_CAMPAIGN_STATUSES.includes(campaign.status)) continue // paused/cancelled since the query
            if (campaign.status === "queued") {
                await prisma.notificationCampaign.updateMany({ where: { id: campaign.id, status: "queued" }, data: { status: "sending" } })
            }
            ctx = await loadComposeContext(campaign as NotificationCampaign, rules)
            contexts.set(key, ctx)
        }
        touched.add(d.campaign_id)

        // Claim: only one run can move this row out of "queued".
        const attemptNo = d.attempts + 1
        const claimed = await prisma.notificationDelivery.updateMany({
            where: { id: d.id, status: "queued", attempts: d.attempts },
            data: { attempts: { increment: 1 } },
        })
        if (claimed.count === 0) continue

        const sub = await loadSubscriber(d.subscriber_id)
        // Re-checked right before sending: an unsubscribe in between wins.
        const eligible = sub && (ctx.campaign.type === "invitation" ? sub.status === "pending" : sub.status === "active")
        const message = eligible ? await composeMessage(ctx, sub) : null
        if (!sub || !message) {
            await prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: "skipped" } })
            result.skipped++
            continue
        }

        const outcome = await transport.send(message)
        if (outcome.ok) {
            await prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: "sent", sent_at: new Date(), last_error: null } })
            await prisma.notificationCampaign.update({ where: { id: d.campaign_id }, data: { sent_count: { increment: 1 } } })
            await prisma.notificationSubscriber.update({ where: { id: sub.id }, data: { last_sent_at: new Date() } })
            result.sent++
        } else if (outcome.permanent || attemptNo >= MAX_SEND_ATTEMPTS) {
            await prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: "failed", last_error: outcome.error } })
            await prisma.notificationCampaign.update({ where: { id: d.campaign_id }, data: { failed_count: { increment: 1 } } })
            // A hard bounce suppresses the address for every future campaign.
            if (outcome.permanent) {
                await prisma.notificationSubscriber.updateMany({
                    where: { id: sub.id, status: { in: ["active", "pending"] } },
                    data: { status: "bounced" },
                })
            }
            result.failed++
        } else {
            // Temporary failure: stays queued; attempts was bumped by the claim.
            await prisma.notificationDelivery.update({ where: { id: d.id }, data: { last_error: outcome.error } })
            result.retried++
        }
    }

    const active = await prisma.notificationCampaign.findMany({ where: { status: "sending" }, select: { id: true } })
    result.completed_campaigns = await finishCampaigns([...new Set([...touched, ...active.map((c) => c.id)])])
    result.remaining = await prisma.notificationDelivery.count({
        where: { status: "queued", campaign: { status: { in: ACTIVE_CAMPAIGN_STATUSES } } },
    })
    return result
}

// ─── Admin controls (#201 API; UI in #202) ────────────────────────────

export type ControlOutcome = { ok: true; status: string } | { ok: false; error: string }

const FINAL = ["sent", "cancelled", "failed"]

export async function pauseCampaign(id: bigint): Promise<ControlOutcome> {
    const { count } = await prisma.notificationCampaign.updateMany({
        where: { id, status: { in: ["queued", "sending", "scheduled"] } },
        data: { status: "paused" },
    })
    return count ? { ok: true, status: "paused" } : { ok: false, error: "Only queued, scheduled or sending campaigns can be paused." }
}

export async function resumeCampaign(id: bigint): Promise<ControlOutcome> {
    const { count } = await prisma.notificationCampaign.updateMany({ where: { id, status: "paused" }, data: { status: "queued" } })
    return count ? { ok: true, status: "queued" } : { ok: false, error: "Only paused campaigns can be resumed." }
}

export async function cancelCampaign(id: bigint): Promise<ControlOutcome> {
    const { count } = await prisma.notificationCampaign.updateMany({
        where: { id, status: { notIn: FINAL } },
        data: { status: "cancelled" },
    })
    if (!count) return { ok: false, error: "This campaign has already finished." }
    await prisma.notificationDelivery.updateMany({ where: { campaign_id: id, status: "queued" }, data: { status: "skipped" } })
    return { ok: true, status: "cancelled" }
}

/** sent_at of every delivery sent in the last 24 h (at most the daily cap's worth). */
async function recentSends(now: Date): Promise<Date[]> {
    const rows = await prisma.notificationDelivery.findMany({
        where: { status: "sent", sent_at: { gt: new Date(now.getTime() - 24 * HOUR_MS) } },
        select: { sent_at: true },
    })
    return rows.map((r) => r.sent_at).filter((d): d is Date => d !== null)
}

/** Today's use of the daily limit: sent in the rolling 24 h window, and when a slot frees up once it is full. */
function quota(recent: Date[], limits: SendLimits, now: Date) {
    return { sent: recent.length, limit: limits.perDay, resets_at: windowResetsAt(recent, limits, now) }
}

/** Queued deliveries that go out before `campaignId`'s first queued one (oldest first, across active campaigns). */
async function queuedAhead(campaignId: bigint): Promise<number> {
    const first = await prisma.notificationDelivery.findFirst({
        where: { campaign_id: campaignId, status: "queued" },
        orderBy: { id: "asc" },
        select: { id: true },
    })
    if (!first) return 0
    return prisma.notificationDelivery.count({
        where: { status: "queued", id: { lt: first.id }, campaign: { status: { in: ACTIVE_CAMPAIGN_STATUSES } } },
    })
}

export async function campaignProgress(
    id: bigint,
    limits: SendLimits = getSendLimits(),
    now: Date = new Date(),
    recentSentAt?: Date[],
) {
    const campaign = await prisma.notificationCampaign.findUnique({ where: { id }, select: { id: true, status: true, type: true } })
    if (!campaign) return null
    const [grouped, retrying, recent, ahead, retryable] = await Promise.all([
        prisma.notificationDelivery.groupBy({ by: ["status"], where: { campaign_id: id }, _count: { _all: true } }),
        prisma.notificationDelivery.count({ where: { campaign_id: id, status: "queued", attempts: { gt: 0 } } }),
        recentSentAt ?? recentSends(now),
        queuedAhead(id),
        countRetryable(id, campaign.type),
    ])
    const counts = { queued: 0, sent: 0, failed: 0, skipped: 0 }
    for (const g of grouped) if (g.status in counts) counts[g.status as keyof typeof counts] = g._count._all
    // Paused or not yet approved campaigns do not move, so they get no dates.
    const moving = ACTIVE_CAMPAIGN_STATUSES.includes(campaign.status)
    const schedule = moving
        ? estimateSchedule({ ahead, remaining: counts.queued, recentSentAt: recent, limits, now })
        : { starts_at: null, finishes_at: null }
    const etaMinutes = schedule.finishes_at ? Math.max(1, Math.ceil((schedule.finishes_at.getTime() - now.getTime()) / 60000)) : null
    return {
        status: campaign.status,
        ...counts,
        remaining: counts.queued,
        retrying,
        ahead,
        retryable,
        starts_at: schedule.starts_at,
        finishes_at: schedule.finishes_at,
        eta_minutes: counts.queued ? etaMinutes : 0,
        today: quota(recent, limits, now),
    }
}

// ─── Queue overview and retry (#246) ───────────────────────────────────

const RETRY_STATUSES = ["queued", "sending", "paused", "sent"]

/** Subscriber statuses that may still receive a campaign of this type. */
function eligibleStatuses(type: string): string[] {
    return type === "invitation" ? ["pending"] : ["active"]
}

/** Failed deliveries of a campaign, split into the ones a retry would re-queue and the ones it leaves out. */
async function failedSplit(campaignId: bigint) {
    const campaign = await prisma.notificationCampaign.findUnique({ where: { id: campaignId }, select: { id: true, type: true, status: true } })
    if (!campaign) return null
    const failed = await prisma.notificationDelivery.findMany({
        where: { campaign_id: campaignId, status: "failed" },
        select: { id: true, subscriber_id: true },
    })
    const subscribers = failed.length
        ? await prisma.notificationSubscriber.findMany({
            where: { id: { in: [...new Set(failed.map((f) => f.subscriber_id))] } },
            select: { id: true, status: true },
        })
        : []
    const statusOf = new Map(subscribers.map((s) => [s.id.toString(), s.status]))
    const allowed = eligibleStatuses(campaign.type)
    const retry: bigint[] = []
    const excluded = { bounced: 0, unsubscribed: 0, other: 0 }
    for (const f of failed) {
        const st = statusOf.get(f.subscriber_id.toString())
        if (st && allowed.includes(st)) retry.push(f.id)
        else if (st === "bounced" || st === "complained") excluded.bounced++
        else if (st === "unsubscribed") excluded.unsubscribed++
        else excluded.other++
    }
    return { campaign, retry, excluded }
}

/** Failed deliveries a retry would re-queue, counted in the database. */
function countRetryable(campaignId: bigint, type: string): Promise<number> {
    return prisma.notificationDelivery.count({
        where: { campaign_id: campaignId, status: "failed", subscriber: { status: { in: eligibleStatuses(type) } } },
    })
}

export type RetryOutcome =
    | { ok: true; retried: number; excluded: { bounced: number; unsubscribed: number; other: number }; status: string }
    | { ok: false; error: string; notFound?: boolean }

/**
 * Puts a campaign's failed deliveries back in the queue, except those whose
 * subscriber can no longer receive it (bounced, unsubscribed, complained):
 * retrying them would only hurt the mailbox's reputation. Retried rows go
 * out through the normal throttled queue.
 */
export async function retryFailedDeliveries(campaignId: bigint): Promise<RetryOutcome> {
    const split = await failedSplit(campaignId)
    if (!split) return { ok: false, error: "Campaign not found", notFound: true }
    const { campaign, retry, excluded } = split
    if (!RETRY_STATUSES.includes(campaign.status)) {
        return { ok: false, error: `A ${campaign.status} campaign cannot be retried. Only sending, paused or sent campaigns can.` }
    }
    if (!retry.length) return { ok: true, retried: 0, excluded, status: campaign.status }

    // A finished campaign goes back to sending; paused stays paused until resumed.
    const status = campaign.status === "sent" ? "sending" : campaign.status
    const retried = await prisma.$transaction(async (tx) => {
        // Guarded on the status read above, so a cancel in between is never overwritten.
        const moved = await tx.notificationCampaign.updateMany({ where: { id: campaignId, status: campaign.status }, data: { status } })
        if (!moved.count) return null
        const requeued = await tx.notificationDelivery.updateMany({
            where: { id: { in: retry }, campaign_id: campaignId, status: "failed" },
            data: { status: "queued", attempts: 0, last_error: null },
        })
        // Recount rather than decrement, so a drifted counter can never go negative.
        const failedLeft = await tx.notificationDelivery.count({ where: { campaign_id: campaignId, status: "failed" } })
        await tx.notificationCampaign.update({ where: { id: campaignId }, data: { failed_count: failedLeft } })
        return requeued.count
    })
    if (retried === null) return { ok: false, error: "The campaign changed while retrying. Reload the page and try again." }
    return { ok: true, retried, excluded, status }
}

const REASON_MAX = 200

/** Failed deliveries of a campaign with the reason, for the admin (#246). */
export async function listFailedDeliveries(campaignId: bigint, offset: number, limit: number) {
    const split = await failedSplit(campaignId)
    if (!split) return null
    const retryable = new Set(split.retry.map(String))
    const [rows, total] = await Promise.all([
        prisma.notificationDelivery.findMany({
            where: { campaign_id: campaignId, status: "failed" },
            orderBy: { id: "asc" },
            skip: offset,
            take: limit,
            select: { id: true, attempts: true, last_error: true, updated_at: true, subscriber: { select: { email: true, status: true } } },
        }),
        prisma.notificationDelivery.count({ where: { campaign_id: campaignId, status: "failed" } }),
    ])
    return {
        rows: rows.map((r) => ({
            id: r.id,
            email: r.subscriber.email,
            subscriber_status: r.subscriber.status,
            attempts: r.attempts,
            reason: (r.last_error ?? "Unknown error").replace(/\s+/g, " ").slice(0, REASON_MAX),
            failed_at: r.updated_at,
            retryable: retryable.has(r.id.toString()),
        })),
        total,
    }
}

/** The send queue at a glance for the notifications dashboard (#246). */
export async function queueSummary(limits: SendLimits = getSendLimits(), now: Date = new Date()) {
    const campaigns = await prisma.notificationCampaign.findMany({
        where: { status: { in: [...ACTIVE_CAMPAIGN_STATUSES, "paused"] } },
        select: { id: true, type: true, status: true, subject_override: true, created_at: true },
        orderBy: { id: "asc" },
    })
    const recent = await recentSends(now)
    const rows = await Promise.all(campaigns.map(async (c) => {
        const p = await campaignProgress(c.id, limits, now, recent)
        return {
            id: c.id,
            type: c.type,
            status: c.status,
            subject: c.subject_override,
            pending: p?.queued ?? 0,
            retrying: p?.retrying ?? 0,
            sent: p?.sent ?? 0,
            failed: p?.failed ?? 0,
            retryable: p?.retryable ?? 0,
            starts_at: p?.starts_at ?? null,
            finishes_at: p?.finishes_at ?? null,
        }
    }))
    // Queue order: the campaign whose deliveries go out first comes first; paused ones last.
    rows.sort((a, b) => (a.status === "paused" ? 1 : 0) - (b.status === "paused" ? 1 : 0)
        || (a.starts_at?.getTime() ?? Infinity) - (b.starts_at?.getTime() ?? Infinity)
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const totals = rows.reduce(
        (t, r) => ({ pending: t.pending + r.pending, retrying: t.retrying + r.retrying, sent: t.sent + r.sent, failed: t.failed + r.failed, retryable: t.retryable + r.retryable }),
        { pending: 0, retrying: 0, sent: 0, failed: 0, retryable: 0 },
    )
    return { today: quota(recent, limits, now), limits, totals, campaigns: rows }
}
