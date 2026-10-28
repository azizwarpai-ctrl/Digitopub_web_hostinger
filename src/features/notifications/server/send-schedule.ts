/**
 * When queued deliveries will go out (#246). Replays the send cron: every
 * tick sends min(per run, hourly room, rolling 24 h room), the same budget
 * as computeBudget() in send-service.ts, so the estimate follows the real
 * limits instead of spreading the daily cap evenly over the day.
 */

import type { SendLimits } from "./config"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** The send cron runs every 5 minutes (docs/ops/cron-schedule.md). */
export const SEND_TICK_MS = 5 * MINUTE_MS
/** Past this the estimate is reported as unknown rather than simulated further. */
const HORIZON_MS = 90 * DAY_MS

export interface ScheduleInput {
    /** Queued deliveries that go out before this campaign's first one. */
    ahead: number
    /** This campaign's queued deliveries. */
    remaining: number
    /** sent_at of every delivery sent in the last 24 h, any campaign. */
    recentSentAt: Date[]
    limits: SendLimits
    now: Date
    tickMs?: number
}

export interface ScheduleEstimate {
    /** When this campaign's first queued delivery should go out; null when nothing is queued or past the horizon. */
    starts_at: Date | null
    /** When its last queued delivery should go out; null when nothing is queued or past the horizon. */
    finishes_at: Date | null
}

/** Pure: replays the throttle tick by tick until this campaign's last delivery is sent. */
export function estimateSchedule(input: ScheduleInput): ScheduleEstimate {
    const { ahead, remaining, limits, now } = input
    if (remaining <= 0) return { starts_at: null, finishes_at: null }
    const tickMs = input.tickMs ?? SEND_TICK_MS
    const firstTarget = ahead + 1
    const lastTarget = ahead + remaining

    // Send times, oldest first: the real recent ones, then the simulated ones.
    const sent = input.recentSentAt.map((d) => d.getTime()).filter((t) => t > now.getTime() - DAY_MS).sort((a, b) => a - b)
    let dayStart = 0
    let hourStart = 0
    let delivered = 0
    let startsAt: Date | null = null

    for (let t = now.getTime(); t - now.getTime() <= HORIZON_MS; t += tickMs) {
        while (dayStart < sent.length && sent[dayStart] <= t - DAY_MS) dayStart++
        while (hourStart < sent.length && sent[hourStart] <= t - HOUR_MS) hourStart++
        const budget = Math.max(0, Math.min(
            limits.perRun,
            limits.perHour - (sent.length - hourStart),
            limits.perDay - (sent.length - dayStart),
        ))
        if (budget === 0) continue
        const before = delivered
        delivered = Math.min(lastTarget, delivered + budget)
        for (let i = before; i < delivered; i++) sent.push(t)
        if (!startsAt && delivered >= firstTarget) startsAt = new Date(t)
        if (delivered >= lastTarget) return { starts_at: startsAt, finishes_at: new Date(t) }
    }
    return { starts_at: startsAt, finishes_at: null }
}

/** Pure: when the rolling 24 h window frees its next slot, or null when it is not full. */
export function windowResetsAt(recentSentAt: Date[], limits: SendLimits, now: Date): Date | null {
    const inWindow = recentSentAt.map((d) => d.getTime()).filter((t) => t > now.getTime() - DAY_MS).sort((a, b) => a - b)
    if (inWindow.length < limits.perDay) return null
    return new Date(inWindow[inWindow.length - limits.perDay] + DAY_MS)
}
