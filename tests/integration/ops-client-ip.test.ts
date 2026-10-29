import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Hono } from "hono"

import { opsRouter } from "@/src/server/routes/ops"

const app = new Hono().route("/ops", opsRouter)
const saved = process.env.CRON_SECRET

beforeEach(() => { process.env.CRON_SECRET = "ops-test-secret" })
afterEach(() => { saved === undefined ? delete process.env.CRON_SECRET : (process.env.CRON_SECRET = saved) })

describe("GET /ops/client-ip (#194 diagnostic)", () => {
    it("rejects requests without the cron secret", async () => {
        expect((await app.request("/ops/client-ip")).status).toBe(401)
        expect((await app.request("/ops/client-ip", { headers: { authorization: "Bearer wrong" } })).status).toBe(401)
    })

    it("fails closed when CRON_SECRET is unset", async () => {
        delete process.env.CRON_SECRET
        expect((await app.request("/ops/client-ip", { headers: { authorization: "Bearer " } })).status).toBe(401)
    })

    it("echoes only the caller's own forwarding headers, split into hops", async () => {
        const res = await app.request("/ops/client-ip", {
            headers: {
                authorization: "Bearer ops-test-secret",
                "x-forwarded-for": "1.1.1.1, 203.0.113.7 ,198.51.100.2",
                "x-real-ip": "203.0.113.7",
            },
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.x_forwarded_for).toEqual(["1.1.1.1", "203.0.113.7", "198.51.100.2"])
        expect(body.data["x-real-ip"]).toBe("203.0.113.7")
        expect(body.data["cf-connecting-ip"]).toBeNull()
        expect(body.data).toHaveProperty("used_for_rate_limits")
    })
})
