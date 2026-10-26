import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  ojsQuery: vi.fn(),
  settingUpsert: vi.fn(),
}))

vi.mock("@/src/features/ojs/server/ojs-client", () => ({ ojsQuery: h.ojsQuery }))
vi.mock("@/src/lib/db/config", () => ({
  prisma: {
    systemSetting: { upsert: h.settingUpsert },
  },
}))

import {
  computeOjsJournalsFingerprint,
  syncOjsJournals,
} from "@/src/features/ojs/server/sync-ojs-journals"

const parts = (journalSum = "100", settingsSum = "200") => [
  { scope: "journals", c: 13, s: journalSum },
  { scope: "settings", c: 50, s: settingsSum },
]

describe("OJS journal content fingerprint", () => {
  beforeEach(() => {
    h.ojsQuery.mockReset()
    h.settingUpsert.mockReset()
    h.settingUpsert.mockResolvedValue({})
  })

  it("returns a v2 fingerprint covering every mirrored setting", async () => {
    h.ojsQuery.mockResolvedValue(parts())

    await expect(computeOjsJournalsFingerprint()).resolves.toBe("v2:13:100:50:200")

    const sql = h.ojsQuery.mock.calls[0][0] as string
    expect(sql).toContain("primary_locale")
    for (const name of [
      "name",
      "description",
      "homepageImage",
      "journalThumbnail",
      "printIssn",
      "onlineIssn",
      "publisherInstitution",
      "abbreviation",
      "contactName",
      "aimsAndScope",
      "authorGuidelines",
      "publicationFee",
      "submissionFee",
    ]) {
      expect(sql).toContain(`'${name}'`)
    }
    expect(sql).not.toContain("digitopubSpecialization")
  })

  it("changes when only mirrored settings content changes", async () => {
    h.ojsQuery
      .mockResolvedValueOnce(parts("100", "200"))
      .mockResolvedValueOnce(parts("100", "201"))

    const before = await computeOjsJournalsFingerprint()
    const after = await computeOjsJournalsFingerprint()

    expect(after).not.toBe(before)
  })

  it("stores the pre-fetch fingerprint instead of recomputing", async () => {
    await syncOjsJournals([], { fingerprint: "v2:captured" })

    expect(h.ojsQuery).not.toHaveBeenCalled()
    expect(h.settingUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ setting_value: "v2:captured" }),
      update: { setting_value: "v2:captured" },
    }))
  })
})
