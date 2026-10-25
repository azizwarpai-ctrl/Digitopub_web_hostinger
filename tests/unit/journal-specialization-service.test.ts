import { describe, it, expect, beforeEach, vi } from "vitest"

const h = vi.hoisted(() => ({
  specFindMany: vi.fn(),
  specFindFirst: vi.fn(),
  specFindUnique: vi.fn(),
  specCreate: vi.fn(),
  specUpdate: vi.fn(),
  journalFindUnique: vi.fn(),
  journalFindMany: vi.fn(),
  journalUpdate: vi.fn(),
  journalUpdateMany: vi.fn(),
  journalGroupBy: vi.fn(),
  jobFindMany: vi.fn(),
  enqueue: vi.fn(),
  run: vi.fn(),
  latest: vi.fn(),
  retry: vi.fn(),
}))

vi.mock("@/src/lib/db/config", () => {
  const tx = {
    journalSpecialization: { update: h.specUpdate },
    journal: { updateMany: h.journalUpdateMany },
  }
  return {
    prisma: {
      journalSpecialization: { findMany: h.specFindMany, findFirst: h.specFindFirst, findUnique: h.specFindUnique, create: h.specCreate },
      journal: { findUnique: h.journalFindUnique, findMany: h.journalFindMany, update: h.journalUpdate, groupBy: h.journalGroupBy },
      ojsSyncJob: { findMany: h.jobFindMany },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})

vi.mock("@/src/features/ojs/server/ojs-sync-jobs", () => ({
  JOB_SET_JOURNAL_SPECIALIZATION: "set_journal_specialization",
  enqueueSyncJob: h.enqueue,
  runSyncJob: h.run,
  getLatestSyncJob: h.latest,
  retryLatestSyncJob: h.retry,
}))

import {
  SpecializationError,
  createSpecialization,
  getAllJournalSyncStatuses,
  getJournalSpecialization,
  listSpecializations,
  setJournalSpecialization,
  updateSpecialization,
} from "@/src/features/journals/server/specialization-service"

const doneJob = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  status: "succeeded",
  attempts: 1,
  last_error: null,
  next_attempt_at: new Date("2026-10-26T10:00:00Z"),
  completed_at: new Date("2026-10-26T10:00:01Z"),
  updated_at: new Date("2026-10-26T10:00:01Z"),
  ...over,
})

describe("specialization-service (#234)", () => {
  beforeEach(() => {
    for (const fn of Object.values(h)) fn.mockReset()
    h.enqueue.mockResolvedValue(doneJob({ status: "pending", completed_at: null }))
    h.run.mockResolvedValue(doneJob())
  })

  it("lists names with case-insensitive usage counts", async () => {
    h.specFindMany.mockResolvedValue([
      { id: 1n, name: "General Science", sort_order: 0, is_active: true },
      { id: 2n, name: "Dentistry", sort_order: 20, is_active: true },
    ])
    h.journalGroupBy.mockResolvedValue([{ field: "general science", _count: { _all: 8 } }])
    expect(await listSpecializations({ includeInactive: false })).toEqual([
      { id: "1", name: "General Science", sort_order: 0, is_active: true, usage_count: 8 },
      { id: "2", name: "Dentistry", sort_order: 20, is_active: true, usage_count: 0 },
    ])
    expect(h.specFindMany.mock.calls[0][0].where).toEqual({ is_active: true })
  })

  it("refuses to add a name that already exists", async () => {
    h.specFindFirst.mockResolvedValue({ id: 2n, name: "Dentistry" })
    await expect(createSpecialization({ name: "dentistry" })).rejects.toMatchObject({ status: 409 })
    expect(h.specCreate).not.toHaveBeenCalled()
  })

  describe("setJournalSpecialization", () => {
    it("stores the canonical name and syncs a linked journal at once", async () => {
      h.journalFindUnique.mockResolvedValue({ id: 5n, ojs_id: "10" })
      h.specFindFirst.mockResolvedValue({ id: 2n, name: "Dentistry", is_active: true })

      const result = await setJournalSpecialization(5n, "dentistry", 3n)

      expect(h.journalUpdate).toHaveBeenCalledWith({ where: { id: 5n }, data: { field: "Dentistry" } })
      expect(h.enqueue).toHaveBeenCalledWith({
        action: "set_journal_specialization",
        targetType: "journal",
        targetId: "5",
        payload: { ojs_journal_id: 10, value: "Dentistry" },
        createdBy: 3n,
      })
      expect(h.run).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ journal_id: "5", field: "Dentistry", sync: { state: "synced", attempts: 1 } })
    })

    it("reports pending when the first attempt fails", async () => {
      h.journalFindUnique.mockResolvedValue({ id: 5n, ojs_id: "10" })
      h.specFindFirst.mockResolvedValue({ id: 2n, name: "Dentistry", is_active: true })
      h.run.mockResolvedValue(doneJob({ status: "pending", completed_at: null, last_error: "HTTP 503: down" }))
      const result = await setJournalSpecialization(5n, "Dentistry", 3n)
      expect(result.sync).toMatchObject({ state: "pending", last_error: "HTTP 503: down" })
      expect(result.sync.next_attempt_at).not.toBeNull()
    })

    it("saves without syncing when the journal has no OJS id", async () => {
      h.journalFindUnique.mockResolvedValue({ id: 5n, ojs_id: null })
      h.specFindFirst.mockResolvedValue({ id: 2n, name: "Dentistry", is_active: true })
      const result = await setJournalSpecialization(5n, "Dentistry", 3n)
      expect(h.journalUpdate).toHaveBeenCalled()
      expect(h.enqueue).not.toHaveBeenCalled()
      expect(result.sync.state).toBe("not_linked")
    })

    it("rejects a retired or unknown name without touching the journal", async () => {
      h.journalFindUnique.mockResolvedValue({ id: 5n, ojs_id: "10" })
      h.specFindFirst.mockResolvedValueOnce({ id: 9n, name: "Uncategorized", is_active: false }).mockResolvedValueOnce(null)
      await expect(setJournalSpecialization(5n, "Uncategorized", 3n)).rejects.toMatchObject({ status: 400 })
      await expect(setJournalSpecialization(5n, "Astrology", 3n)).rejects.toBeInstanceOf(SpecializationError)
      expect(h.journalUpdate).not.toHaveBeenCalled()
    })

    it("404s an unknown journal", async () => {
      h.journalFindUnique.mockResolvedValue(null)
      await expect(setJournalSpecialization(99n, "Dentistry", 3n)).rejects.toMatchObject({ status: 404 })
    })
  })

  describe("updateSpecialization", () => {
    it("renames across journals and re-syncs the linked ones only", async () => {
      h.specFindUnique.mockResolvedValue({ id: 2n, name: "Dentistry", is_active: true })
      h.specFindFirst.mockResolvedValue(null)
      h.journalFindMany.mockResolvedValue([{ id: 5n, ojs_id: "10" }, { id: 6n, ojs_id: null }])
      h.specUpdate.mockResolvedValue({ id: 2n, name: "Dental Medicine", sort_order: 20, is_active: true })

      const result = await updateSpecialization(2n, { name: "Dental Medicine" }, 3n)

      expect(h.journalUpdateMany).toHaveBeenCalledWith({ where: { field: "Dentistry" }, data: { field: "Dental Medicine" } })
      expect(h.enqueue).toHaveBeenCalledOnce()
      expect(h.enqueue.mock.calls[0][0]).toMatchObject({ targetId: "5", payload: { ojs_journal_id: 10, value: "Dental Medicine" } })
      expect(result.journalsUpdated).toBe(2)
    })

    it("retires without touching journals or OJS", async () => {
      h.specFindUnique.mockResolvedValue({ id: 9n, name: "Uncategorized", is_active: true })
      h.specUpdate.mockResolvedValue({ id: 9n, name: "Uncategorized", is_active: false })
      await updateSpecialization(9n, { is_active: false }, 3n)
      expect(h.journalUpdateMany).not.toHaveBeenCalled()
      expect(h.enqueue).not.toHaveBeenCalled()
    })

    it("refuses a rename onto another existing name", async () => {
      h.specFindUnique.mockResolvedValue({ id: 2n, name: "Dentistry", is_active: true })
      h.specFindFirst.mockResolvedValue({ id: 3n, name: "Medicine" })
      await expect(updateSpecialization(2n, { name: "medicine" }, 3n)).rejects.toMatchObject({ status: 409 })
      expect(h.specUpdate).not.toHaveBeenCalled()
    })
  })

  it("loads the edit-page journal by numeric id only (never via ojs_id)", async () => {
    h.journalFindUnique.mockResolvedValue({ id: 3n, title: "J3", field: "General Science", ojs_id: "4", ojs_path: "jirdm" })
    h.latest.mockResolvedValue(null)
    const detail = await getJournalSpecialization(3n)
    expect(h.journalFindUnique.mock.calls[0][0].where).toEqual({ id: 3n })
    expect(detail).toMatchObject({ journal_id: "3", ojs_id: "4", sync: { state: "never" } })
  })

  it("keeps only the latest job per journal for the status map", async () => {
    h.jobFindMany.mockResolvedValue([
      { ...doneJob({ id: 3n, status: "failed", last_error: "HTTP 404" }), target_id: "5" },
      { ...doneJob({ id: 2n }), target_id: "5" },
      { ...doneJob({ id: 1n }), target_id: "6" },
    ])
    const map = await getAllJournalSyncStatuses()
    expect(map["5"].state).toBe("failed")
    expect(map["6"].state).toBe("synced")
  })
})
