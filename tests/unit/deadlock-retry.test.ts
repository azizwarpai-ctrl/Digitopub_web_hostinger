import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"

const h = vi.hoisted(() => ({ transaction: vi.fn() }))

vi.mock("@/src/lib/db/config", () => ({ prisma: { $transaction: h.transaction } }))

import { withDeadlockRetry } from "@/src/lib/db/deadlock-retry"

const deadlock = () => new Prisma.PrismaClientKnownRequestError("deadlock", { code: "P2034", clientVersion: "7" })

describe("withDeadlockRetry", () => {
  beforeEach(() => {
    h.transaction.mockReset()
  })

  it("retries the whole transaction after a deadlock", async () => {
    h.transaction
      .mockImplementationOnce(async (operation) => {
        await operation({ id: "tx-1" })
        throw deadlock()
      })
      .mockImplementationOnce(async (operation) => operation({ id: "tx-2" }))
    const operation = vi.fn().mockResolvedValue("saved")

    await expect(withDeadlockRetry(operation)).resolves.toBe("saved")

    expect(h.transaction).toHaveBeenCalledTimes(2)
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it("does not retry validation or other non-deadlock errors", async () => {
    h.transaction.mockRejectedValue(new Error("invalid specialization"))

    await expect(withDeadlockRetry(vi.fn())).rejects.toThrow("invalid specialization")

    expect(h.transaction).toHaveBeenCalledOnce()
  })

  it("stops after the bounded number of attempts", async () => {
    h.transaction.mockRejectedValue(deadlock())

    await expect(withDeadlockRetry(vi.fn(), 3)).rejects.toMatchObject({ code: "P2034" })

    expect(h.transaction).toHaveBeenCalledTimes(3)
  })
})
