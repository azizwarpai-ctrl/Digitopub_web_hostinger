import { describe, it, expect, vi, beforeEach } from "vitest"

const hoisted = vi.hoisted(() => ({
    executeRaw: vi.fn(async () => 0),
    importRowDeleteMany: vi.fn(async () => ({ count: 4 })),
    subscriberDeleteMany: vi.fn(async () => ({ count: 2 })),
}))

vi.mock("@/src/lib/db/config", () => ({
    prisma: {
        $executeRaw: hoisted.executeRaw,
        subscriberImportRow: { deleteMany: hoisted.importRowDeleteMany },
        notificationSubscriber: { deleteMany: hoisted.subscriberDeleteMany },
    },
}))

import { retentionCleanup } from "@/src/features/metrics/server/jobs"

const DAY = 24 * 60 * 60 * 1000

describe("retentionCleanup: notification data", () => {
    beforeEach(() => vi.clearAllMocks())

    it("purges import staging after 14 days and never-confirmed subscribers after 90", async () => {
        const before = Date.now()
        const result = await retentionCleanup()

        expect(result).toMatchObject({ importRowsDeleted: 4, pendingSubscribersDeleted: 2 })

        const stagingWhere = (hoisted.importRowDeleteMany.mock.calls[0] as any)[0].where
        expect(before - stagingWhere.created_at.lt.getTime()).toBeGreaterThanOrEqual(14 * DAY - 1000)

        const subWhere = (hoisted.subscriberDeleteMany.mock.calls[0] as any)[0].where
        expect(subWhere).toMatchObject({ status: "pending", confirmed_at: null })
        // updated_at, so re-requesting a confirmation link restarts the clock.
        const age = before - subWhere.updated_at.lt.getTime()
        expect(age).toBeGreaterThanOrEqual(90 * DAY - 1000)
        expect(age).toBeLessThan(91 * DAY)
    })
})
