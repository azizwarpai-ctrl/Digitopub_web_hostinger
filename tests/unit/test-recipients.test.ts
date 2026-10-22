import { describe, it, expect } from "vitest"

import { MAX_TEST_RECIPIENTS, collectRecipients, parseEmailList } from "@/src/lib/email/email-list"
import {
    TEST_EMAILS_PER_HOUR,
    describeTestSend,
    sendToEach,
    takeTestSendBudget,
} from "@/src/features/notifications/server/test-send-budget"

describe("parseEmailList", () => {
    it("splits on commas, semicolons, spaces and new lines; lower-cases; drops duplicates; keeps order", () => {
        expect(parseEmailList("A@x.org, b@x.org;c@x.org\nd@x.org  a@X.org")).toEqual({
            valid: ["a@x.org", "b@x.org", "c@x.org", "d@x.org"],
            invalid: [],
        })
    })

    it("separates invalid entries", () => {
        expect(parseEmailList(["ok@x.org", "nope", "also@bad"])).toEqual({ valid: ["ok@x.org"], invalid: ["nope", "also@bad"] })
        expect(parseEmailList("  ")).toEqual({ valid: [], invalid: [] })
    })

    it("merges the legacy single address with the list", () => {
        expect(collectRecipients({ to: "Me@x.org", recipients: ["me@x.org", "you@x.org"] })).toEqual(["me@x.org", "you@x.org"])
        expect(collectRecipients({})).toEqual([])
        expect(MAX_TEST_RECIPIENTS).toBe(10)
    })
})

describe("test send budget", () => {
    it("allows 50 test emails per hour in total, then resets", () => {
        const t0 = Date.UTC(2031, 0, 1)
        expect(takeTestSendBudget(45, t0)).toBe(true)
        expect(takeTestSendBudget(10, t0 + 1)).toBe(false)
        expect(takeTestSendBudget(5, t0 + 2)).toBe(true)
        expect(takeTestSendBudget(1, t0 + 3)).toBe(false)
        expect(takeTestSendBudget(TEST_EMAILS_PER_HOUR, t0 + 61 * 60 * 1000)).toBe(true)
    })

    it("sends to every address even when one fails, and describes the outcome", async () => {
        const r = await sendToEach(["a@x.org", "b@x.org", "c@x.org"], async (to) => {
            if (to === "b@x.org") return { ok: false, error: "550 rejected" }
            if (to === "c@x.org") throw new Error("socket closed")
            return { ok: true }
        })
        expect(r).toEqual({
            sent: ["a@x.org"],
            failed: [{ to: "b@x.org", error: "550 rejected" }, { to: "c@x.org", error: "socket closed" }],
        })
        expect(describeTestSend(r)).toBe("Test sent to 1 of 3 addresses")
        expect(describeTestSend({ sent: ["a@x.org"], failed: [] })).toBe("Test sent to a@x.org")
        expect(describeTestSend({ sent: [], failed: [{ to: "a@x.org", error: "boom" }] })).toBe("Test to a@x.org failed: boom")
    })
})
