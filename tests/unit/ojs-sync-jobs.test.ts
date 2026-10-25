import { describe, it, expect, beforeEach, vi } from "vitest"

const hoisted = vi.hoisted(() => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    writer: vi.fn(),
}))

vi.mock("@/src/lib/db/config", () => ({
    prisma: {
        ojsSyncJob: {
            findFirst: hoisted.findFirst,
            findMany: hoisted.findMany,
            findUniqueOrThrow: hoisted.findUniqueOrThrow,
            create: hoisted.create,
            update: hoisted.update,
            updateMany: hoisted.updateMany,
        },
    },
}))

vi.mock("@/src/lib/ojs-write-guard", () => ({
    setJournalSpecializationInOjsWithAudit: hoisted.writer,
}))

import {
    JOB_SET_JOURNAL_SPECIALIZATION,
    MAX_ATTEMPTS,
    backoffMs,
    drainDueSyncJobs,
    enqueueSyncJob,
    retryLatestSyncJob,
    runSyncJob,
} from "@/src/features/ojs/server/ojs-sync-jobs"

const job = (over: Record<string, unknown> = {}) => ({
    id: 1n,
    action: JOB_SET_JOURNAL_SPECIALIZATION,
    target_type: "journal",
    target_id: "5",
    payload: { ojs_journal_id: 10, value: "Dentistry" },
    status: "running",
    attempts: 0,
    created_by: 3n,
    ...over,
})

describe("ojs-sync-jobs (#234)", () => {
    beforeEach(() => {
        for (const fn of Object.values(hoisted)) fn.mockReset()
        hoisted.update.mockImplementation(async ({ data }) => ({ ...job(), ...data }))
        hoisted.create.mockImplementation(async ({ data }) => ({ id: 2n, ...data }))
    })

    it("backs off exponentially from 1 minute, capped at 6 hours", () => {
        expect(backoffMs(1)).toBe(60_000)
        expect(backoffMs(2)).toBe(120_000)
        expect(backoffMs(5)).toBe(16 * 60_000)
        expect(backoffMs(50)).toBe(6 * 60 * 60_000)
    })

    describe("enqueueSyncJob", () => {
        const input = { action: JOB_SET_JOURNAL_SPECIALIZATION, targetType: "journal", targetId: "5", payload: { ojs_journal_id: 10, value: "Medicine" }, createdBy: 3n }

        it("creates a job when nothing is pending", async () => {
            hoisted.findFirst.mockResolvedValue(null)
            await enqueueSyncJob(input)
            expect(hoisted.create).toHaveBeenCalledOnce()
            expect(hoisted.create.mock.calls[0][0].data).toMatchObject({ target_id: "5", payload: { value: "Medicine" }, created_by: 3n })
        })

        it("supersedes the pending job instead of queueing a second write", async () => {
            hoisted.findFirst.mockResolvedValue(job({ id: 9n, status: "pending", attempts: 4 }))
            await enqueueSyncJob(input)
            expect(hoisted.create).not.toHaveBeenCalled()
            expect(hoisted.update.mock.calls[0][0]).toMatchObject({
                where: { id: 9n },
                data: { payload: { value: "Medicine" }, attempts: 0, last_error: null },
            })
        })
    })

    describe("runSyncJob", () => {
        it("does nothing when another worker already claimed the job", async () => {
            hoisted.updateMany.mockResolvedValue({ count: 0 })
            expect(await runSyncJob(1n)).toBeNull()
            expect(hoisted.writer).not.toHaveBeenCalled()
        })

        it("marks the job succeeded and passes payload and actor to the writer", async () => {
            hoisted.updateMany.mockResolvedValue({ count: 1 })
            hoisted.findUniqueOrThrow.mockResolvedValue(job())
            hoisted.writer.mockResolvedValue({ success: true, retryable: false })

            const result = await runSyncJob(1n)

            expect(hoisted.writer).toHaveBeenCalledWith({ ojsJournalId: 10, value: "Dentistry", actorAdminId: 3n })
            expect(result).toMatchObject({ status: "succeeded", attempts: 1, last_error: null })
        })

        it("reschedules a retryable failure with backoff", async () => {
            hoisted.updateMany.mockResolvedValue({ count: 1 })
            hoisted.findUniqueOrThrow.mockResolvedValue(job({ attempts: 2 }))
            hoisted.writer.mockResolvedValue({ success: false, retryable: true, error: "HTTP 503: down" })

            const before = Date.now()
            const result = await runSyncJob(1n)

            expect(result).toMatchObject({ status: "pending", attempts: 3, last_error: "HTTP 503: down", completed_at: null })
            const next = (hoisted.update.mock.calls[0][0].data.next_attempt_at as Date).getTime()
            expect(next - before).toBeGreaterThanOrEqual(backoffMs(3) - 50)
        })

        it("fails at once when the error is not retryable", async () => {
            hoisted.updateMany.mockResolvedValue({ count: 1 })
            hoisted.findUniqueOrThrow.mockResolvedValue(job())
            hoisted.writer.mockResolvedValue({ success: false, retryable: false, error: "HTTP 404: Journal not found" })
            expect(await runSyncJob(1n)).toMatchObject({ status: "failed", attempts: 1 })
        })

        it("gives up after MAX_ATTEMPTS", async () => {
            hoisted.updateMany.mockResolvedValue({ count: 1 })
            hoisted.findUniqueOrThrow.mockResolvedValue(job({ attempts: MAX_ATTEMPTS - 1 }))
            hoisted.writer.mockResolvedValue({ success: false, retryable: true, error: "timeout" })
            expect(await runSyncJob(1n)).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS })
        })

        it("records a thrown writer error as retryable", async () => {
            hoisted.updateMany.mockResolvedValue({ count: 1 })
            hoisted.findUniqueOrThrow.mockResolvedValue(job())
            hoisted.writer.mockRejectedValue(new Error("boom"))
            expect(await runSyncJob(1n)).toMatchObject({ status: "pending", last_error: "boom" })
        })

        it("fails a job whose action has no handler", async () => {
            hoisted.updateMany.mockResolvedValue({ count: 1 })
            hoisted.findUniqueOrThrow.mockResolvedValue(job({ action: "unknown" }))
            expect(await runSyncJob(1n)).toMatchObject({ status: "failed" })
        })
    })

    it("drainDueSyncJobs recovers stale running jobs and counts outcomes", async () => {
        hoisted.findMany.mockResolvedValue([{ id: 1n }, { id: 2n }])
        hoisted.updateMany
            .mockResolvedValueOnce({ count: 0 }) // stale-running recovery
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 })
        hoisted.findUniqueOrThrow.mockResolvedValue(job())
        hoisted.writer
            .mockResolvedValueOnce({ success: true, retryable: false })
            .mockResolvedValueOnce({ success: false, retryable: true, error: "down" })

        expect(await drainDueSyncJobs()).toEqual({ attempted: 2, succeeded: 1, failed: 0, retrying: 1 })
        expect(hoisted.updateMany.mock.calls[0][0]).toMatchObject({ where: { status: "running" }, data: { status: "pending" } })
    })

    describe("retryLatestSyncJob", () => {
        it("reopens a failed job with a fresh attempt budget", async () => {
            hoisted.findFirst.mockResolvedValue(job({ status: "failed", attempts: 10 }))
            await retryLatestSyncJob(JOB_SET_JOURNAL_SPECIALIZATION, "journal", "5")
            expect(hoisted.update.mock.calls[0][0].data).toMatchObject({ status: "pending", attempts: 0, completed_at: null })
        })

        it("has nothing to retry once the job succeeded", async () => {
            hoisted.findFirst.mockResolvedValue(job({ status: "succeeded" }))
            expect(await retryLatestSyncJob(JOB_SET_JOURNAL_SPECIALIZATION, "journal", "5")).toBeNull()
            expect(hoisted.update).not.toHaveBeenCalled()
        })
    })
})
