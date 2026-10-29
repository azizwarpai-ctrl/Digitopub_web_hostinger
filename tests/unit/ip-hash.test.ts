import { afterEach, describe, it, expect } from "vitest"

process.env.EVENT_IP_HASH_SALT_SEED ||= "test-event-ip-hash-salt-seed"
process.env.IDENTITY_COOKIE_SECRET ||= "test-identity-cookie-secret"
process.env.ORCID_STATE_SECRET ||= "test-orcid-state-secret"
process.env.ORCID_CLIENT_ID ||= "test-orcid-client"
process.env.ORCID_CLIENT_SECRET ||= "test-orcid-client-secret"

import {
    hashIp,
    hashUa,
    hashWithDailySalt,
    dayKey,
    clientIpFromHeaders,
} from "@/src/lib/ip-hash"

describe("ip-hash", () => {
    it("dayKey returns YYYY-MM-DD UTC", () => {
        const d = new Date(Date.UTC(2026, 4, 12, 23, 59, 59))
        expect(dayKey(d)).toBe("2026-05-12")
    })

    it("produces deterministic hash for same (ip, day)", () => {
        const h1 = hashIp("192.0.2.1", "2026-05-12")
        const h2 = hashIp("192.0.2.1", "2026-05-12")
        expect(h1).toBe(h2)
        expect(h1).toMatch(/^[0-9a-f]{64}$/)
    })

    it("different day produces different hash", () => {
        const a = hashIp("192.0.2.1", "2026-05-12")
        const b = hashIp("192.0.2.1", "2026-05-13")
        expect(a).not.toBe(b)
    })

    it("different IP produces different hash on same day", () => {
        const a = hashIp("192.0.2.1", "2026-05-12")
        const b = hashIp("203.0.113.7", "2026-05-12")
        expect(a).not.toBe(b)
    })

    it("hashUa works the same way", () => {
        const a = hashUa("Mozilla/5.0", "2026-05-12")
        const b = hashUa("Mozilla/5.0", "2026-05-12")
        const c = hashUa("Chrome/127", "2026-05-12")
        expect(a).toBe(b)
        expect(a).not.toBe(c)
    })

    it("empty input returns empty string (not a hash)", () => {
        expect(hashWithDailySalt("", "2026-05-12")).toBe("")
    })

    // #194: X-Forwarded-For is client-controlled on the left; the trusted
    // proxy appends the real client on the right (verified in production).
    describe("clientIpFromHeaders", () => {
        const saved = process.env.TRUSTED_PROXY_HOPS
        afterEach(() => { saved === undefined ? delete process.env.TRUSTED_PROXY_HOPS : (process.env.TRUSTED_PROXY_HOPS = saved) })

        it("uses the right-most X-Forwarded-For entry, ignoring spoofed values on the left", () => {
            const h = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })
            expect(clientIpFromHeaders(h)).toBe("10.0.0.1")
        })
        it("resolves production's observed header shape to the real client", () => {
            // Shape recorded on #194: [SPOOF, SPOOF, CLIENT, SPOOF, SPOOF, CLIENT, CLIENT].
            const h = new Headers({
                "x-forwarded-for": "203.0.113.98, 203.0.113.99, 198.51.100.7, 203.0.113.98, 203.0.113.99, 198.51.100.7, 198.51.100.7",
                "x-real-ip": "198.51.100.7",
            })
            expect(clientIpFromHeaders(h)).toBe("198.51.100.7")
        })
        it("gives a spoofing client the same IP whatever it sends", () => {
            const ips = ["9.9.9.9", "8.8.8.8, 7.7.7.7", "1.1.1.1,2.2.2.2,3.3.3.3"].map((spoof) =>
                clientIpFromHeaders(new Headers({ "x-forwarded-for": `${spoof}, 198.51.100.7` })))
            expect(new Set(ips)).toEqual(new Set(["198.51.100.7"]))
        })
        it("counts TRUSTED_PROXY_HOPS entries from the right", () => {
            process.env.TRUSTED_PROXY_HOPS = "2"
            expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.1.1.1, 198.51.100.7, 10.0.0.2" }))).toBe("198.51.100.7")
        })
        it("falls back to x-real-ip when the chain is shorter than the trusted hops", () => {
            process.env.TRUSTED_PROXY_HOPS = "3"
            expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7")
            expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1")
        })
        it("treats a missing or invalid TRUSTED_PROXY_HOPS as 1", () => {
            for (const v of [undefined, "0", "-2", "abc", "1.5"]) {
                if (v === undefined) delete process.env.TRUSTED_PROXY_HOPS
                else process.env.TRUSTED_PROXY_HOPS = v
                expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.1.1.1, 198.51.100.7" }))).toBe("198.51.100.7")
            }
        })
        it("ignores empty entries and whitespace", () => {
            expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": " 1.1.1.1 , , 198.51.100.7 ," }))).toBe("198.51.100.7")
        })
        it("falls back to x-real-ip without X-Forwarded-For", () => {
            const h = new Headers({ "x-real-ip": "5.6.7.8" })
            expect(clientIpFromHeaders(h)).toBe("5.6.7.8")
        })
        it("never trusts headers the proxy does not set (cf-connecting-ip, x-client-ip)", () => {
            expect(clientIpFromHeaders(new Headers({ "cf-connecting-ip": "9.9.9.9", "x-client-ip": "8.8.8.8" }))).toBe("0.0.0.0")
        })
        it("returns 0.0.0.0 when nothing is set", () => {
            const h = new Headers()
            expect(clientIpFromHeaders(h)).toBe("0.0.0.0")
        })
    })
})
