import { describe, it, expect, beforeEach } from "vitest"

process.env.NOTIFY_TOKEN_SECRET = "notify-test-secret"

import { __resetEnvCacheForTests } from "@/src/lib/env"
import {
    CONFIRM_TOKEN_TTL_SECONDS,
    hashNotifyToken,
    signNotifyToken,
    verifyNotifyToken,
} from "@/src/lib/notification-token"

const NOW = 1_800_000_000

beforeEach(() => {
    process.env.NOTIFY_TOKEN_SECRET = "notify-test-secret"
    __resetEnvCacheForTests()
})

describe("notification tokens", () => {
    it("round-trips subscriber id and version", () => {
        const t = signNotifyToken({ purpose: "manage", subscriberId: 42n, version: 3, now: NOW })
        expect(verifyNotifyToken(t, "manage", NOW + 10)).toEqual({ subscriberId: 42n, version: 3, iat: NOW, exp: null })
    })

    it("expires confirm links after 30 days, but manage and unsub links never", () => {
        const confirm = signNotifyToken({ purpose: "confirm", subscriberId: 1n, version: 0, now: NOW })
        expect(verifyNotifyToken(confirm, "confirm", NOW + CONFIRM_TOKEN_TTL_SECONDS)).not.toBeNull()
        expect(verifyNotifyToken(confirm, "confirm", NOW + CONFIRM_TOKEN_TTL_SECONDS + 1)).toBeNull()

        const unsub = signNotifyToken({ purpose: "unsub", subscriberId: 1n, version: 0, now: NOW })
        expect(verifyNotifyToken(unsub, "unsub", NOW + 10 * 365 * 24 * 3600)).not.toBeNull()
    })

    it("rejects a token used for another purpose", () => {
        const unsub = signNotifyToken({ purpose: "unsub", subscriberId: 1n, version: 0 })
        expect(verifyNotifyToken(unsub, "manage")).toBeNull()
        expect(verifyNotifyToken(unsub, "confirm")).toBeNull()
    })

    it("rejects a tampered payload or signature", () => {
        const t = signNotifyToken({ purpose: "manage", subscriberId: 7n, version: 0 })
        const [payload, sig] = t.split(".")
        const forged = Buffer.from(JSON.stringify({ p: "manage", sid: "8", v: 0, iat: NOW, exp: null }))
            .toString("base64url")
        expect(verifyNotifyToken(`${forged}.${sig}`, "manage")).toBeNull()
        expect(verifyNotifyToken(`${payload}.${sig.slice(0, -2)}xx`, "manage")).toBeNull()
        expect(verifyNotifyToken(`${payload}`, "manage")).toBeNull()
        expect(verifyNotifyToken("", "manage")).toBeNull()
        expect(verifyNotifyToken("a".repeat(600), "manage")).toBeNull()
    })

    it("rejects tokens signed with a different secret", () => {
        const t = signNotifyToken({ purpose: "manage", subscriberId: 7n, version: 0 })
        process.env.NOTIFY_TOKEN_SECRET = "rotated"
        __resetEnvCacheForTests()
        expect(verifyNotifyToken(t, "manage")).toBeNull()
    })

    it("hashes deterministically for single-use storage", () => {
        const t = signNotifyToken({ purpose: "confirm", subscriberId: 1n, version: 0, now: NOW })
        expect(hashNotifyToken(t)).toMatch(/^[0-9a-f]{64}$/)
        expect(hashNotifyToken(t)).toBe(hashNotifyToken(t))
    })
})
