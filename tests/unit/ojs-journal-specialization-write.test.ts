import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const hoisted = vi.hoisted(() => ({
    auditCreate: vi.fn(),
    auditUpdate: vi.fn(),
}))

vi.mock("@/src/lib/db/config", () => ({
    prisma: { auditOjsWrite: { create: hoisted.auditCreate, update: hoisted.auditUpdate } },
}))

import { setJournalSpecializationInOjsWithAudit } from "@/src/lib/ojs-write-guard"
import { postToUserBridge, resolveUserBridgeUrl } from "@/src/features/ojs/server/ojs-client"

const fetchMock = vi.fn()

function answer(status: number, body: unknown) {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status })
}

describe("OJS user bridge client (#234)", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock)
        fetchMock.mockReset()
        process.env.OJS_BASE_URL = "https://ojs.example.org"
        process.env.OJS_API_KEY = "test-key"
        delete process.env.OJS_USER_BRIDGE_URL
        process.env.OJS_BRIDGE_URL = "https://ojs.example.org/ojs-pdf-bridge.php"
    })
    afterEach(() => vi.unstubAllGlobals())

    it("never uses OJS_BRIDGE_URL (that is the PDF bridge)", () => {
        expect(resolveUserBridgeUrl()).toBe("https://ojs.example.org/ojs-user-bridge.php")
    })

    it("honours OJS_USER_BRIDGE_URL", () => {
        process.env.OJS_USER_BRIDGE_URL = "https://other.example.org/bridge.php/"
        expect(resolveUserBridgeUrl()).toBe("https://other.example.org/bridge.php")
    })

    it("sends the action with the bearer key", async () => {
        fetchMock.mockResolvedValue(answer(200, { success: true, before: null, after: "Dentistry" }))
        const result = await postToUserBridge({ action: "set_journal_specialization", journal_id: 10, value: "Dentistry" })
        expect(result).toEqual({ ok: true, status: 200, data: { success: true, before: null, after: "Dentistry" } })
        const [url, init] = fetchMock.mock.calls[0]
        expect(String(url)).toBe("https://ojs.example.org/ojs-user-bridge.php")
        expect(init.headers.Authorization).toBe("Bearer test-key")
        expect(JSON.parse(init.body)).toEqual({ action: "set_journal_specialization", journal_id: 10, value: "Dentistry" })
    })

    it.each([
        [400, false],
        [404, false],
        [401, true],
        [403, true],
        [429, true],
        [500, true],
        [503, true],
    ])("HTTP %i is retryable=%s", async (status, retryable) => {
        fetchMock.mockResolvedValue(answer(status, { success: false, error: "nope" }))
        const result = await postToUserBridge({ action: "x" })
        expect(result).toMatchObject({ ok: false, status, error: "nope", retryable })
    })

    it("reports a redirect instead of following it (a followed 301 turns the POST into a GET)", async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 301, headers: { location: "https://journals.digitopub.com/ojs-user-bridge.php" } }))
        const result = await postToUserBridge({ action: "x" })
        expect(fetchMock.mock.calls[0][1].redirect).toBe("manual")
        expect(result).toMatchObject({ ok: false, status: 301, retryable: true })
        expect(result.ok === false && result.error).toContain("journals.digitopub.com")
    })

    it("treats network errors as retryable", async () => {
        fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))
        expect(await postToUserBridge({})).toMatchObject({ ok: false, status: null, retryable: true, error: "ECONNREFUSED" })
    })

    it("refuses plain HTTP to a non-local host", async () => {
        process.env.OJS_BASE_URL = "http://ojs.example.org"
        expect(await postToUserBridge({})).toMatchObject({ ok: false, retryable: false })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("reports missing configuration without calling OJS", async () => {
        delete process.env.OJS_API_KEY
        expect(await postToUserBridge({})).toMatchObject({ ok: false, retryable: true })
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe("setJournalSpecializationInOjsWithAudit (#234)", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock)
        fetchMock.mockReset()
        hoisted.auditCreate.mockReset().mockResolvedValue({ id: 7n })
        hoisted.auditUpdate.mockReset().mockResolvedValue({})
        process.env.OJS_BASE_URL = "https://ojs.example.org"
        process.env.OJS_API_KEY = "test-key"
    })
    afterEach(() => vi.unstubAllGlobals())

    it("writes the audit row before calling OJS, then records before/after", async () => {
        const order: string[] = []
        hoisted.auditCreate.mockImplementation(async () => {
            order.push("audit")
            return { id: 7n }
        })
        fetchMock.mockImplementation(async () => {
            order.push("ojs")
            return answer(200, { success: true, before: "General Science", after: "Dentistry" })
        })

        const result = await setJournalSpecializationInOjsWithAudit({ ojsJournalId: 10, value: " Dentistry ", actorAdminId: 3n })

        expect(order).toEqual(["audit", "ojs"])
        expect(result).toEqual({ success: true, auditId: 7n, before: "General Science", after: "Dentistry", retryable: false })
        expect(hoisted.auditCreate.mock.calls[0][0].data).toMatchObject({
            ojs_table: "journal_settings",
            reason: "journal_specialization",
            target_type: "journal",
            target_id: "10",
            actor_admin_id: 3n,
            after_value: "Dentistry",
        })
        expect(hoisted.auditUpdate.mock.calls[0][0]).toMatchObject({
            where: { id: 7n },
            data: { success: true, before_value: "General Science", after_value: "Dentistry" },
        })
    })

    it("marks the audit row failed and passes retryable through", async () => {
        fetchMock.mockResolvedValue(answer(503, { success: false, error: "down" }))
        const result = await setJournalSpecializationInOjsWithAudit({ ojsJournalId: 10, value: "Dentistry" })
        expect(result).toMatchObject({ success: false, retryable: true, error: "HTTP 503: down" })
        expect(hoisted.auditUpdate.mock.calls[0][0].data).toMatchObject({ success: false, error: "HTTP 503: down" })
    })

    it("does not report success when resolving the audit row fails", async () => {
        fetchMock.mockResolvedValue(answer(200, { success: true, before: null, after: "Dentistry" }))
        hoisted.auditUpdate.mockRejectedValue(new Error("db gone"))
        await expect(setJournalSpecializationInOjsWithAudit({ ojsJournalId: 10, value: "Dentistry" })).rejects.toThrow("db gone")
    })
})
