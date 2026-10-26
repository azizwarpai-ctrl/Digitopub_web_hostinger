import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  findUnique: vi.fn(),
}))

vi.mock("@/src/lib/db/config", () => ({
  prisma: {
    $executeRaw: h.executeRaw,
    systemSetting: { findUnique: h.findUnique },
  },
}))

import { acquireJobLock } from "@/src/lib/cron-lock"

describe("acquireJobLock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.executeRaw.mockResolvedValue(1)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("round-trips a JSON-safe numeric timestamp", async () => {
    const now = 1_700_000_000_123
    vi.spyOn(Date, "now").mockReturnValue(now)
    h.findUnique.mockResolvedValue({ setting_value: now })

    await expect(acquireJobLock("ojs_push_sync_lock", 120_000)).resolves.toBe(true)

    expect(h.executeRaw.mock.calls[0][2]).toBe(now)
  })

  it("does not acquire a lock owned by a different attempt", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_123)
    h.findUnique.mockResolvedValue({ setting_value: 1_700_000_000_124 })

    await expect(acquireJobLock("ojs_push_sync_lock", 120_000)).resolves.toBe(false)
  })
})
