import { describe, it, expect } from "vitest"

import { unsyncedCount } from "@/src/features/journals/utils/sync-summary"

describe("unsyncedCount (#252)", () => {
    it("counts failed and pending journals", () => {
        expect(unsyncedCount({ "1": { state: "failed" }, "2": { state: "pending" }, "3": { state: "synced" } })).toBe(2)
    })
    it("ignores synced, not-linked and never-synced journals", () => {
        expect(unsyncedCount({ "1": { state: "synced" }, "2": { state: "not_linked" }, "3": { state: "never" } } as never)).toBe(0)
    })
    it("is 0 while the status is still loading", () => {
        expect(unsyncedCount(undefined)).toBe(0)
        expect(unsyncedCount({})).toBe(0)
    })
})
