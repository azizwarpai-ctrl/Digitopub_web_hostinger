import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  journalFindUnique: vi.fn(),
  journalCreate: vi.fn(),
  journalUpdate: vi.fn(),
  journalFindMany: vi.fn(),
  journalUpdateMany: vi.fn(),
  defaultFindFirst: vi.fn(),
  settingUpsert: vi.fn(),
  ojsQuery: vi.fn(),
}))

vi.mock("@/src/lib/db/config", () => ({
  prisma: {
    journal: {
      findUnique: h.journalFindUnique,
      create: h.journalCreate,
      update: h.journalUpdate,
      findMany: h.journalFindMany,
      updateMany: h.journalUpdateMany,
    },
    journalSpecialization: { findFirst: h.defaultFindFirst },
    systemSetting: { upsert: h.settingUpsert },
  },
}))

vi.mock("@/src/features/ojs/server/ojs-client", () => ({ ojsQuery: h.ojsQuery }))

import { syncOjsJournals } from "@/src/features/ojs/server/sync-ojs-journals"
import type { OjsJournal } from "@/src/features/ojs/schemas/ojs-schema"

const incoming: OjsJournal = {
  journal_id: 99,
  path: "new-journal",
  primary_locale: "en",
  enabled: true,
  name: "New Journal",
  description: null,
}

describe("OJS journal discovery specialization (#234)", () => {
  beforeEach(() => {
    for (const fn of Object.values(h)) fn.mockReset()
    h.journalFindUnique.mockResolvedValue(null)
    h.journalCreate.mockImplementation(async ({ data }) => ({ id: 1n, ...data }))
    h.journalUpdate.mockImplementation(async ({ data }) => data)
    h.journalFindMany.mockResolvedValue([])
    h.settingUpsert.mockResolvedValue({})
    h.ojsQuery.mockResolvedValue([{ c: 1, s: "1" }])
    h.defaultFindFirst.mockResolvedValue({ name: "Dental Medicine", is_default: true, is_active: true })
  })

  it("uses the current name of the active default after it is renamed", async () => {
    const result = await syncOjsJournals([incoming])

    expect(result).toMatchObject({ synced: 1, errors: 0 })
    expect(h.defaultFindFirst.mock.calls[0][0].where).toEqual({ is_default: true, is_active: true })
    expect(h.journalCreate.mock.calls[0][0].data.field).toBe("Dental Medicine")
  })

  it("does not create a journal with an unmanaged fallback when no active default exists", async () => {
    h.defaultFindFirst.mockResolvedValue(null)

    const result = await syncOjsJournals([incoming])

    expect(result).toMatchObject({ synced: 0, errors: 1 })
    expect(h.journalCreate).not.toHaveBeenCalled()
  })

  it("does not require the default when only updating an existing journal", async () => {
    h.journalFindUnique.mockResolvedValue({ id: 1n, ojs_id: "99", ojs_path: "old-path" })

    const result = await syncOjsJournals([incoming])

    expect(result).toMatchObject({ synced: 1, errors: 0 })
    expect(h.defaultFindFirst).not.toHaveBeenCalled()
  })
})
