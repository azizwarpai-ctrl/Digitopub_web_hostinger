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

export async function campaignProgress(id: bigint, limits: SendLimits = getSendLimits()) {
    const campaign = await prisma.notificationCampaign.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!campaign) return null
    const grouped = await prisma.notificationDelivery.groupBy({ by: ["status"], where: { campaign_id: id }, _count: { _all: true } })
    const counts = { queued: 0, sent: 0, failed: 0, skipped: 0 } as Record<string, number>
    for (const g of grouped) counts[g.status] = g._count._all
    // Sustainable rate: the tighter of 12 runs/hour × per-run and the hourly cap, and the daily cap.
    const perHour = Math.min(limits.perRun * 12, limits.perHour, limits.perDay / 24)
    const etaMinutes = counts.queued && perHour > 0 ? Math.ceil((counts.queued / perHour) * 60) : 0
    return { status: campaign.status, ...counts, remaining: counts.queued, eta_minutes: etaMinutes }
}
