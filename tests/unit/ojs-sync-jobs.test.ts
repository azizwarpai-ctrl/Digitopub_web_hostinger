import { describe, it, expect, beforeEach, vi } from "vitest"
import { Prisma } from "@prisma/client"

const hoisted = vi.hoisted(() => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    queryRaw: vi.fn(),
    writer: vi.fn(),
}))

vi.mock("@/src/lib/db/config", () => ({
    prisma: {
        $queryRaw: hoisted.queryRaw,
        ojsSyncJob: {
            findUnique: hoisted.findUnique,
            findUniqueOrThrow: hoisted.findUniqueOrThrow,
            findFirst: hoisted.findFirst,
            findMany: hoisted.findMany,
            groupBy: hoisted.groupBy,
            create: hoisted.create,
            updateMany: hoisted.updateMany,
        },
    },
}))

vi.mock("@/src/lib/ojs-write-guard", () => ({
    setJournalSpecializationInOjsWithAudit: hoisted.writer,
}))

import {
    JOB_SET_JOURNAL_SPECIALIZATION,
    backoffMs,
    drainDueSyncJobs,
    enqueueSyncJob,
    getLatestSyncJobsByTarget,
    retryLatestSyncJob,
    runSyncJob,
    slotKey,
} from "@/src/features/ojs/server/ojs-sync-jobs"

const KEY = slotKey(JOB_SET_JOURNAL_SPECIALIZATION, "journal", "5")

const job = (over: Record<string, unknown> = {}) => ({
    id: 1n,
    action: JOB_SET_JOURNAL_SPECIALIZATION,
    target_type: "journal",
    target_id: "5",
    payload: { ojs_journal_id: 10, value: "Dentistry" },
    status: "pending",
    attempts: 0,
    created_by: 3n,
    next_attempt_at: new Date(0),
    ...over,
})

const unique = () => new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "7" })

/** updateMany calls whose data matches `fields`. */
const updatesWith = (fields: Record<string, unknown>) =>
    hoisted.updateMany.mock.calls.filter(([arg]) => Object.entries(fields).every(([k, v]) => arg.data[k] === v))

describe("ojs-sync-jobs (#234)", () => {
    beforeEach(() => {
        for (const fn of Object.values(hoisted)) fn.mockReset()
        hoisted.updateMany.mockResolvedValue({ count: 1 })
        hoisted.queryRaw.mockResolvedValue([])
        hoisted.findUniqueOrThrow.mockImplementation(async ({ where }) => job({ id: where.id }))
        hoisted.create.mockImplementation(async ({ data }) => job({ id: 2n, ...data }))
    })

    it("backs off exponentially from 1 minute, capped at 6 hours", () => {
        expect(backoffMs(1)).toBe(60_000)
        expect(backoffMs(2)).toBe(120_000)
        expect(backoffMs(50)).toBe(6 * 60 * 60_000)
    })

    describe("enqueueSyncJob", () => {
        const input = { action: JOB_SET_JOURNAL_SPECIALIZATION, targetType: "journal", targetId: "5", payload: { ojs_journal_id: 10, value: "Medicine" }, createdBy: 3n }

        it("creates a job holding the pending slot", async () => {
            hoisted.findUnique.mockResolvedValue(null)
            await enqueueSyncJob(input)
            expect(hoisted.queryRaw.mock.calls[0][0].join(" ")).toContain("FOR UPDATE")
            expect(hoisted.create.mock.calls[0][0].data).toMatchObject({ pending_key: KEY, payload: { value: "Medicine" }, created_by: 3n })
        })

        it("replaces the pending payload only while it is still pending", async () => {
            hoisted.queryRaw.mockResolvedValue([{ id: 9n, created_by: 3n }])
            hoisted.findUnique.mockResolvedValue(job({ id: 9n, attempts: 4 }))
            await enqueueSyncJob(input)
            expect(hoisted.create).not.toHaveBeenCalled()
            expect(hoisted.updateMany.mock.calls[0][0]).toMatchObject({
                where: { id: 9n, status: "pending" },
                data: { payload: { value: "Medicine" }, attempts: 0, last_error: null },
            })
        })

        it("queues a new job when the pending one was claimed meanwhile", async () => {
            hoisted.queryRaw.mockResolvedValueOnce([{ id: 9n, created_by: 3n }]).mockResolvedValueOnce([])
            hoisted.findUnique.mockResolvedValueOnce(job({ id: 9n })).mockResolvedValueOnce(null)
            hoisted.updateMany.mockResolvedValueOnce({ count: 0 })
            await enqueueSyncJob(input)
            expect(hoisted.create).toHaveBeenCalledOnce()
        })

        it("replaces instead when a concurrent save created the pending job first", async () => {
            hoisted.queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 9n, created_by: 3n }])
            hoisted.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(job({ id: 9n }))
            hoisted.create.mockRejectedValueOnce(unique())
            await enqueueSyncJob(input)
            expect(hoisted.updateMany.mock.calls[0][0].where).toEqual({ id: 9n, status: "pending" })
        })

        it("uses the transaction client when given one", async () => {
            const tx = {
                $queryRaw: vi.fn().mockResolvedValue([]),
                ojsSyncJob: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(job()) },
            }
            await enqueueSyncJob(input, tx as never)
            expect(tx.$queryRaw).toHaveBeenCalledOnce()
            expect(tx.ojsSyncJob.create).toHaveBeenCalledOnce()
            expect(hoisted.create).not.toHaveBeenCalled()
        })
    })

    describe("runSyncJob", () => {
        it("does not run when another job for the target is running (unique running slot)", async () => {
            hoisted.findUnique.mockResolvedValue(job())
            hoisted.updateMany.mockRejectedValueOnce(unique())
            expect(await runSyncJob(1n)).toBeNull()
            expect(hoisted.writer).not.toHaveBeenCalled()
        })

        it("does not run a job that is no longer pending", async () => {
            hoisted.findUnique.mockResolvedValue(job())
            hoisted.updateMany.mockResolvedValueOnce({ count: 0 })
            expect(await runSyncJob(1n)).toBeNull()
        })

        it("claims into the running slot, runs, and frees the slot on success", async () => {
            hoisted.findUnique.mockResolvedValueOnce(job()).mockResolvedValueOnce(null)
            hoisted.writer.mockResolvedValue({ success: true, retryable: false })

            await runSyncJob(1n)

            expect(hoisted.updateMany.mock.calls[0][0]).toMatchObject({
                where: { id: 1n, status: "pending" },
                data: { status: "running", pending_key: null, running_key: KEY },
            })
            expect(hoisted.writer).toHaveBeenCalledWith({ ojsJournalId: 10, value: "Dentistry", actorAdminId: 3n })
            expect(updatesWith({ status: "succeeded", running_key: null })).toHaveLength(1)
        })

        it("uses a payload replaced between the initial read and the claim", async () => {
            hoisted.findUnique
                .mockResolvedValueOnce(job({ payload: { ojs_journal_id: 10, value: "Dentistry" } }))
                .mockResolvedValueOnce(null)
            hoisted.findUniqueOrThrow
                .mockResolvedValueOnce(job({ payload: { ojs_journal_id: 10, value: "Medicine" }, status: "running" }))
                .mockResolvedValueOnce(job({ status: "succeeded" }))
            hoisted.writer.mockResolvedValue({ success: true, retryable: false })

            await runSyncJob(1n)

            expect(hoisted.writer).toHaveBeenCalledWith({ ojsJournalId: 10, value: "Medicine", actorAdminId: 3n })
        })

        it("requeues a retryable failure into the pending slot with backoff, with no attempt cap", async () => {
            hoisted.findUnique.mockResolvedValueOnce(job({ attempts: 40 })).mockResolvedValueOnce(null)
            hoisted.findUniqueOrThrow.mockResolvedValue(job({ attempts: 40 }))
            hoisted.writer.mockResolvedValue({ success: false, retryable: true, error: "HTTP 503: down" })

            await runSyncJob(1n)

            const [requeued] = updatesWith({ status: "pending", pending_key: KEY, running_key: null })
            expect(requeued[0].data).toMatchObject({ attempts: 41, last_error: "HTTP 503: down" })
            expect(updatesWith({ status: "failed" })).toHaveLength(0)
        })

        it("marks the job superseded when a newer save already holds the pending slot", async () => {
            hoisted.findUnique.mockResolvedValueOnce(job()).mockResolvedValueOnce(null)
            hoisted.writer.mockResolvedValue({ success: false, retryable: true, error: "timeout" })
            hoisted.updateMany
                .mockResolvedValueOnce({ count: 1 }) // claim
                .mockRejectedValueOnce(unique()) // requeue: slot taken
                .mockResolvedValueOnce({ count: 1 }) // superseded
            await runSyncJob(1n)
            expect(updatesWith({ status: "superseded", running_key: null })).toHaveLength(1)
        })

        it("fails at once when the error is not retryable", async () => {
            hoisted.findUnique.mockResolvedValueOnce(job()).mockResolvedValueOnce(null)
            hoisted.writer.mockResolvedValue({ success: false, retryable: false, error: "HTTP 404: Journal not found" })
            await runSyncJob(1n)
            expect(updatesWith({ status: "failed", running_key: null })).toHaveLength(1)
        })

        it("then runs the target's next pending job, so the newest value lands last", async () => {
            hoisted.findUnique
                .mockResolvedValueOnce(job({ id: 1n })) // job 1
                .mockResolvedValueOnce(job({ id: 2n, payload: { ojs_journal_id: 10, value: "Medicine" } })) // pending slot after job 1
                .mockResolvedValueOnce(job({ id: 2n, payload: { ojs_journal_id: 10, value: "Medicine" } })) // job 2 load
                .mockResolvedValueOnce(null) // pending slot after job 2
            hoisted.findUniqueOrThrow.mockImplementation(async ({ where }) => job({
                id: where.id,
                payload: { ojs_journal_id: 10, value: where.id === 2n ? "Medicine" : "Dentistry" },
            }))
            hoisted.writer.mockResolvedValue({ success: true, retryable: false })

            await runSyncJob(1n)

            expect(hoisted.writer.mock.calls.map(([a]) => a.value)).toEqual(["Dentistry", "Medicine"])
        })

        it("records a thrown writer error as retryable", async () => {
            hoisted.findUnique.mockResolvedValueOnce(job()).mockResolvedValueOnce(null)
            hoisted.writer.mockRejectedValue(new Error("boom"))
            await runSyncJob(1n)
            expect(updatesWith({ status: "pending", last_error: "boom" })).toHaveLength(1)
        })
    })

    it("drainDueSyncJobs requeues stale running jobs, then runs due ones", async () => {
        hoisted.findMany
            .mockResolvedValueOnce([job({ id: 7n, status: "running" })]) // stale
            .mockResolvedValueOnce([{ id: 1n }]) // due
        hoisted.findUnique.mockResolvedValueOnce(job()).mockResolvedValueOnce(null)
        hoisted.findUniqueOrThrow.mockResolvedValue(job({ status: "succeeded" }))
        hoisted.writer.mockResolvedValue({ success: true, retryable: false })

        expect(await drainDueSyncJobs()).toEqual({ attempted: 1, succeeded: 1, failed: 0, retrying: 0 })
        expect(hoisted.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 7n, status: "running" }, data: { status: "pending", pending_key: KEY } })
    })

    it("retryLatestSyncJob reopens a failed job and runs it", async () => {
        hoisted.findFirst.mockResolvedValue(job({ status: "failed", attempts: 3 }))
        hoisted.findUnique.mockResolvedValueOnce(job({ id: 1n })).mockResolvedValueOnce(job({ id: 1n })).mockResolvedValueOnce(null)
        hoisted.writer.mockResolvedValue({ success: true, retryable: false })

        await retryLatestSyncJob(JOB_SET_JOURNAL_SPECIALIZATION, "journal", "5")

        expect(hoisted.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 1n, status: "failed" }, data: { status: "pending", attempts: 0, pending_key: KEY } })
        expect(hoisted.writer).toHaveBeenCalledOnce()
    })

    it("getLatestSyncJobsByTarget loads one row per target, not the whole history", async () => {
        hoisted.groupBy.mockResolvedValue([{ target_id: "5", _max: { id: 9n } }, { target_id: "6", _max: { id: 4n } }])
        hoisted.findMany.mockResolvedValue([])
        await getLatestSyncJobsByTarget(JOB_SET_JOURNAL_SPECIALIZATION, "journal")
        expect(hoisted.findMany.mock.calls[0][0]).toEqual({ where: { id: { in: [9n, 4n] } } })
    })
})
