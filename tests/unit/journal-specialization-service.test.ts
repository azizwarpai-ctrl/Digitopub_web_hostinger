import { describe, it, expect, beforeEach, vi } from "vitest"

const h = vi.hoisted(() => ({
  specFindMany: vi.fn(),
  specFindFirst: vi.fn(),
  specFindUnique: vi.fn(),
  specCreate: vi.fn(),
  txSpecUpdate: vi.fn(),
  txQueryRaw: vi.fn(),
  journalFindUnique: vi.fn(),
  journalGroupBy: vi.fn(),
  txJournalUpdate: vi.fn(),
  txJournalFindMany: vi.fn(),
  txJournalUpdateMany: vi.fn(),
  enqueue: vi.fn(),
  run: vi.fn(),
  latest: vi.fn(),
  latestByTarget: vi.fn(),
  retry: vi.fn(),
}))

const tx = vi.hoisted(() => ({}))

vi.mock("@/src/lib/db/config", () => {
  Object.assign(tx, {
    $queryRaw: h.txQueryRaw,
    journalSpecialization: { update: h.txSpecUpdate, findFirst: h.specFindFirst },
    journal: { update: h.txJournalUpdate, findMany: h.txJournalFindMany, updateMany: h.txJournalUpdateMany },
  })
  return {
    prisma: {
      journalSpecialization: { findMany: h.specFindMany, findFirst: h.specFindFirst, findUnique: h.specFindUnique, create: h.specCreate },
      journal: { findUnique: h.journalFindUnique, groupBy: h.journalGroupBy },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})

vi.mock("@/src/features/ojs/server/ojs-sync-jobs", () => ({
  JOB_SET_JOURNAL_SPECIALIZATION: "set_journal_specialization",
  enqueueSyncJob: h.enqueue,
  runSyncJob: h.run,
  getLatestSyncJob: h.latest,
  getLatestSyncJobsByTarget: h.latestByTarget,
  retryLatestSyncJob: h.retry,
}))

import {
  SpecializationError,
  createSpecialization,
  getAllJournalSyncStatuses,
  getJournalSpecialization,
  listSpecializations,
  pushAllSpecializationsToOjs,
  requireActiveSpecialization,
  setJournalSpecialization,
  updateSpecialization,
} from "@/src/features/journals/server/specialization-service"

const job = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  target_id: "5",
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
    h.enqueue.mockImplementation(async (input) => job({ id: BigInt(input.targetId), target_id: input.targetId, status: "pending" }))
    h.run.mockResolvedValue(job())
    h.latest.mockResolvedValue(job())
    h.latestByTarget.mockResolvedValue([])
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
  })

  it("refuses to add a name that already exists", async () => {
    h.specFindFirst.mockResolvedValue({ id: 2n, name: "Dentistry" })
    await expect(createSpecialization({ name: "dentistry" })).rejects.toMatchObject({ status: 409 })
    expect(h.specCreate).not.toHaveBeenCalled()
  })

  it("requireActiveSpecialization locks the row and returns the canonical name or a 400", async () => {
    h.txQueryRaw.mockResolvedValueOnce([{ name: "Dentistry" }]).mockResolvedValueOnce([])
    expect(await requireActiveSpecialization("dentistry", tx)).toBe("Dentistry")
    await expect(requireActiveSpecialization("Uncategorized", tx)).rejects.toMatchObject({ status: 400 })
    expect(h.txQueryRaw.mock.calls[0][0].join(" ")).toContain("FOR UPDATE")
  })

  describe("setJournalSpecialization", () => {
    it("locks validation and the journal update in one transaction, then attempts sync", async () => {
      h.journalFindUnique.mockResolvedValue({ id: 5n, ojs_id: "10" })
      h.specFindFirst.mockResolvedValue({ id: 2n, name: "Dentistry", is_active: true })
      h.txQueryRaw
        .mockResolvedValueOnce([{ name: "Dentistry" }])
        .mockResolvedValueOnce([{ id: 5n, ojs_id: "10" }])

      const result = await setJournalSpecialization(5n, "dentistry", 3n)

      expect(h.txQueryRaw).toHaveBeenCalledTimes(2)
      expect(h.txQueryRaw.mock.calls[0][0].join(" ")).toContain("FOR UPDATE")
      expect(h.txQueryRaw.mock.calls[1][0].join(" ")).toContain("FOR UPDATE")
      expect(h.txJournalUpdate).toHaveBeenCalledWith({ where: { id: 5n }, data: { field: "Dentistry" } })
      expect(h.enqueue).toHaveBeenCalledWith(
        { action: "set_journal_specialization", targetType: "journal", targetId: "5", payload: { ojs_journal_id: 10, value: "Dentistry" }, createdBy: 3n },
        tx
      )
      expect(h.run).toHaveBeenCalledWith(5n)
      expect(result).toMatchObject({ journal_id: "5", field: "Dentistry", sync: { state: "synced" } })
    })

    it("reports pending when the first attempt could not reach OJS", async () => {
      h.journalFindUnique.mockResolvedValue({ id: 5n, ojs_id: "10" })
      h.specFindFirst.mockResolvedValue({ id: 2n, name: "Dentistry", is_active: true })
      h.txQueryRaw
        .mockResolvedValueOnce([{ name: "Dentistry" }])
        .mockResolvedValueOnce([{ id: 5n, ojs_id: "10" }])
      h.latest.mockResolvedValue(job({ status: "pending", completed_at: null, last_error: "HTTP 503: down" }))
      const result = await setJournalSpecialization(5n, "Dentistry", 3n)
      expect(result.sync).toMatchObject({ state: "pending", last_error: "HTTP 503: down" })
      expect(result.sync.next_attempt_at).not.toBeNull()
    })

    it("saves without syncing when the journal has no OJS id", async () => {
      h.journalFindUnique.mockResolvedValue({ id: 5n, ojs_id: null })
      h.specFindFirst.mockResolvedValue({ id: 2n, name: "Dentistry", is_active: true })
      h.txQueryRaw
        .mockResolvedValueOnce([{ name: "Dentistry" }])
        .mockResolvedValueOnce([{ id: 5n, ojs_id: null }])
      const result = await setJournalSpecialization(5n, "Dentistry", 3n)
      expect(h.txJournalUpdate).toHaveBeenCalled()
      expect(h.enqueue).not.toHaveBeenCalled()
      expect(result.sync.state).toBe("not_linked")
    })

    it("rejects a retired or unknown name without touching the journal", async () => {
      h.journalFindUnique.mockResolvedValue({ id: 5n, ojs_id: "10" })
      h.specFindFirst.mockResolvedValueOnce({ id: 9n, name: "Uncategorized", is_active: false }).mockResolvedValueOnce(null)
      h.txQueryRaw.mockResolvedValue([])
      await expect(setJournalSpecialization(5n, "Uncategorized", 3n)).rejects.toMatchObject({ status: 400 })
      await expect(setJournalSpecialization(5n, "Astrology", 3n)).rejects.toBeInstanceOf(SpecializationError)
      expect(h.txJournalUpdate).not.toHaveBeenCalled()
    })

    it("404s an unknown journal", async () => {
      h.journalFindUnique.mockResolvedValue(null)
      h.txQueryRaw
        .mockResolvedValueOnce([{ name: "Dentistry" }])
        .mockResolvedValueOnce([])
      await expect(setJournalSpecialization(99n, "Dentistry", 3n)).rejects.toMatchObject({ status: 404 })
    })
  })

  describe("updateSpecialization", () => {
    it("locks the specialization and affected journals before cascading a rename", async () => {
      h.txQueryRaw
        .mockResolvedValueOnce([{ name: "Dentistry", is_default: false }])
        .mockResolvedValueOnce([{ id: 5n, ojs_id: "10" }, { id: 6n, ojs_id: null }, { id: 7n, ojs_id: "11" }])
      h.specFindUnique.mockResolvedValue({ id: 2n, name: "Dentistry", is_active: true, is_default: false })
      h.specFindFirst.mockResolvedValue(null)
      h.txJournalFindMany.mockResolvedValue([{ id: 5n, ojs_id: "10" }, { id: 6n, ojs_id: null }, { id: 7n, ojs_id: "11" }])
      h.txSpecUpdate.mockResolvedValue({ id: 2n, name: "Dental Medicine", sort_order: 20, is_active: true, is_default: false })

      const result = await updateSpecialization(2n, { name: "Dental Medicine" }, 3n)

      expect(h.txQueryRaw).toHaveBeenCalledTimes(2)
      expect(h.txQueryRaw.mock.calls[0][0].join(" ")).toContain("FOR UPDATE")
      expect(h.txQueryRaw.mock.calls[1][0].join(" ")).toContain("FOR UPDATE")
      expect(h.txJournalUpdateMany).toHaveBeenCalledWith({ where: { field: "Dentistry" }, data: { field: "Dental Medicine" } })
      expect(h.enqueue.mock.calls.map(([input, db]) => [input.targetId, input.payload.value, db === tx])).toEqual([
        ["5", "Dental Medicine", true],
        ["7", "Dental Medicine", true],
      ])
      expect(h.run.mock.calls.map(([id]) => id)).toEqual([5n, 7n])
      expect(result.journalsUpdated).toBe(3)
    })

    it("retires without touching journals or OJS", async () => {
      h.txQueryRaw.mockResolvedValueOnce([{ name: "Uncategorized", is_default: false }])
      h.txSpecUpdate.mockResolvedValue({ id: 9n, name: "Uncategorized", is_active: false, is_default: false })
      await updateSpecialization(9n, { is_active: false }, 3n)
      expect(h.txJournalUpdateMany).not.toHaveBeenCalled()
      expect(h.enqueue).not.toHaveBeenCalled()
    })

    it("refuses to retire the default used for newly discovered journals", async () => {
      h.txQueryRaw.mockResolvedValueOnce([{ name: "General Science", is_default: true }])
      await expect(updateSpecialization(1n, { is_active: false }, 3n)).rejects.toMatchObject({ status: 400 })
      expect(h.txSpecUpdate).not.toHaveBeenCalled()
    })

    it("refuses a rename onto another existing name", async () => {
      h.txQueryRaw.mockResolvedValueOnce([{ name: "Dentistry", is_default: false }])
      h.specFindFirst.mockResolvedValue({ id: 3n, name: "Medicine" })
      await expect(updateSpecialization(2n, { name: "medicine" }, 3n)).rejects.toMatchObject({ status: 409 })
      expect(h.txSpecUpdate).not.toHaveBeenCalled()
    })
  })

  it("locks every linked journal before pushing its current value to OJS", async () => {
    h.txJournalFindMany.mockResolvedValue([
      { id: 5n, ojs_id: "10", field: "Dentistry" },
      { id: 6n, ojs_id: "11", field: "General Science" },
    ])
    h.txQueryRaw.mockResolvedValue([
      { id: 5n, ojs_id: "10", field: "Dentistry" },
      { id: 6n, ojs_id: "11", field: "General Science" },
    ])
    h.latestByTarget.mockResolvedValue([job({ target_id: "5" }), job({ target_id: "6", status: "pending" })])

    const counts = await pushAllSpecializationsToOjs(3n)

    expect(h.txQueryRaw.mock.calls[0][0].join(" ")).toContain("FOR UPDATE")
    expect(h.enqueue.mock.calls.map(([input]) => input.payload)).toEqual([
      { ojs_journal_id: 10, value: "Dentistry" },
      { ojs_journal_id: 11, value: "General Science" },
    ])
    expect(counts).toEqual({ queued: 2, synced: 1, pending: 1, failed: 0 })
  })

  it("loads the edit-page journal by numeric id only (never via ojs_id)", async () => {
    h.journalFindUnique.mockResolvedValue({ id: 3n, title: "J3", field: "General Science", ojs_id: "4", ojs_path: "jirdm" })
    h.latest.mockResolvedValue(null)
    const detail = await getJournalSpecialization(3n)
    expect(h.journalFindUnique.mock.calls[0][0].where).toEqual({ id: 3n })
    expect(detail).toMatchObject({ journal_id: "3", ojs_id: "4", sync: { state: "never" } })
  })

  it("builds the status map from the latest job per journal", async () => {
    h.latestByTarget.mockResolvedValue([job({ target_id: "5", status: "failed", last_error: "HTTP 404" }), job({ target_id: "6" })])
    const map = await getAllJournalSyncStatuses()
    expect(map["5"].state).toBe("failed")
    expect(map["6"].state).toBe("synced")
  })
})
