import { describe, it, expect } from "vitest"

import { estimateSchedule, windowResetsAt } from "@/src/features/notifications/server/send-schedule"

const now = new Date("2026-10-28T09:00:00Z")
const HOUR = 60 * 60 * 1000
const days = (a: Date | null, b: Date = now) => (a!.getTime() - b.getTime()) / (24 * HOUR)

describe("estimateSchedule (#246)", () => {
    it("paces 800 recipients at 70/day over about 11½ days, not minutes", () => {
        const e = estimateSchedule({ ahead: 0, remaining: 800, recentSentAt: [], limits: { perRun: 20, perHour: 60, perDay: 70 }, now })
        expect(e.starts_at).toEqual(now)
        // 70 go out today, then 70 every 24 h: the 800th on day 11.
        expect(days(e.finishes_at)).toBeGreaterThan(11)
        expect(days(e.finishes_at)).toBeLessThan(12)
    })

    it("finishes 800 recipients in about one day at production's 750/day and 33/hour", () => {
        const e = estimateSchedule({ ahead: 0, remaining: 800, recentSentAt: [], limits: { perRun: 20, perHour: 33, perDay: 750 }, now })
        expect(days(e.finishes_at)).toBeGreaterThan(1)
        expect(days(e.finishes_at)).toBeLessThan(2)
    })

    it("starts only when today's quota frees up", () => {
        // The whole daily quota was used an hour ago: nothing goes out for 23 h.
        const recentSentAt = Array.from({ length: 70 }, () => new Date(now.getTime() - HOUR))
        const e = estimateSchedule({ ahead: 0, remaining: 10, recentSentAt, limits: { perRun: 20, perHour: 60, perDay: 70 }, now })
        expect(e.starts_at!.getTime()).toBeGreaterThanOrEqual(now.getTime() + 23 * HOUR)
        expect(e.starts_at!.getTime()).toBeLessThan(now.getTime() + 23 * HOUR + 10 * 60 * 1000)
    })

    it("waits behind campaigns queued ahead", () => {
        const limits = { perRun: 20, perHour: 60, perDay: 70 }
        const alone = estimateSchedule({ ahead: 0, remaining: 70, recentSentAt: [], limits, now })
        const behind = estimateSchedule({ ahead: 140, remaining: 70, recentSentAt: [], limits, now })
        expect(days(behind.starts_at)).toBeGreaterThanOrEqual(2)
        expect(behind.finishes_at!.getTime()).toBeGreaterThan(alone.finishes_at!.getTime() + 47 * HOUR)
    })

    it("respects the per-run and hourly caps within a day", () => {
        const e = estimateSchedule({ ahead: 0, remaining: 100, recentSentAt: [], limits: { perRun: 20, perHour: 40, perDay: 1000 }, now })
        // 40 per hour: the 100th goes out in the third hour.
        expect(e.finishes_at!.getTime() - now.getTime()).toBeGreaterThanOrEqual(2 * HOUR)
        expect(e.finishes_at!.getTime() - now.getTime()).toBeLessThan(3 * HOUR)
    })

    it("returns nulls when nothing is queued, and an unknown finish past the horizon", () => {
        expect(estimateSchedule({ ahead: 5, remaining: 0, recentSentAt: [], limits: { perRun: 20, perHour: 60, perDay: 70 }, now }))
            .toEqual({ starts_at: null, finishes_at: null })
        const far = estimateSchedule({ ahead: 0, remaining: 1000, recentSentAt: [], limits: { perRun: 1, perHour: 1, perDay: 1 }, now })
        expect(far.starts_at).toEqual(now)
        expect(far.finishes_at).toBeNull()
    })
})

describe("windowResetsAt (#246)", () => {
    const limits = { perRun: 20, perHour: 60, perDay: 3 }
    it("is null while the daily quota has room", () => {
        expect(windowResetsAt([new Date(now.getTime() - HOUR)], limits, now)).toBeNull()
    })
    it("is when the oldest send in a full window turns 24 h old", () => {
        const sent = [5, 3, 1].map((h) => new Date(now.getTime() - h * HOUR))
        expect(windowResetsAt(sent, limits, now)).toEqual(new Date(now.getTime() + 19 * HOUR))
    })
})
