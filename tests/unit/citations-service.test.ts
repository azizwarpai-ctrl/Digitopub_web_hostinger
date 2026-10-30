import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const prismaMock: any = {
    articleCitationCount: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
}
vi.mock("@/src/lib/db/config", () => ({ get prisma() { return prismaMock } }))
vi.mock("@/src/features/ojs/server/ojs-client", () => ({ ojsQuery: vi.fn(async () => { throw new Error("OJS must not be called") }) }))

const {
    normalizeDoi, fetchCrossrefCount, fetchOpenAlexCount, lookupCitationCount,
    refreshCitationCounts, getCitationCounts, MAX_BATCH,
} = await import("@/src/features/metrics/server/citations-service")

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** fetch stub: crossref/openalex responders keyed by host. */
function fakeFetch(handlers: { crossref?: () => Response; openalex?: () => Response }) {
    return vi.fn(async (url: string) => {
        if (url.startsWith("https://api.crossref.org/")) return (handlers.crossref ?? (() => json({}, 404)))()
        if (url.startsWith("https://api.openalex.org/")) return (handlers.openalex ?? (() => json({}, 404)))()
        throw new Error("unexpected url " + url)
    })
}
const cr = (n: unknown) => () => json({ message: { "is-referenced-by-count": n } })
const oa = (n: unknown) => () => json({ cited_by_count: n })

beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CROSSREF_MAILTO
    delete process.env.SMTP_FROM_EMAIL
})

describe("normalizeDoi", () => {
    it.each([
        ["10.26629/IJMP.2017.02", "10.26629/ijmp.2017.02"],
        ["https://doi.org/10.26629/ijmp.2017.02", "10.26629/ijmp.2017.02"],
        ["doi:10.26629/x", "10.26629/x"],
    ])("accepts %s", (input, expected) => {
        expect(normalizeDoi(input)).toBe(expected)
    })
    it.each([["10.1000/x"], [""], ["10.26629/a b"], [null], [undefined]])("rejects %s", (input) => {
        expect(normalizeDoi(input as any)).toBeNull()
    })
})

describe("fetchCrossrefCount / fetchOpenAlexCount", () => {
    it("parses crossref count and builds URL + User-Agent", async () => {
        const f = fakeFetch({ crossref: cr(7) })
        expect(await fetchCrossrefCount("10.26629/a/b", f)).toBe(7)
        const [url, init] = f.mock.calls[0] as any
        expect(url).toBe(`https://api.crossref.org/works/${encodeURIComponent("10.26629/a/b")}`)
        expect(init.headers["User-Agent"].startsWith("DigitoPub/1.0")).toBe(true)
    })
    it("parses openalex count and builds URL + User-Agent", async () => {
        const f = fakeFetch({ openalex: oa(12) })
        expect(await fetchOpenAlexCount("10.26629/a/b", f)).toBe(12)
        const [url, init] = f.mock.calls[0] as any
        expect(url).toBe(`https://api.openalex.org/works/doi:${encodeURIComponent("10.26629/a/b")}`)
        expect(init.headers["User-Agent"].startsWith("DigitoPub/1.0")).toBe(true)
    })
    it("appends mailto when configured", async () => {
        process.env.CROSSREF_MAILTO = "ops@digitopub.com"
        const f = fakeFetch({ openalex: oa(1), crossref: cr(1) })
        await fetchOpenAlexCount("10.26629/x", f)
        await fetchCrossrefCount("10.26629/x", f)
        expect((f.mock.calls[0] as any)[0]).toContain("?mailto=ops%40digitopub.com")
        expect((f.mock.calls[1] as any)[1].headers["User-Agent"]).toContain("mailto:ops@digitopub.com")
    })
    it("404 -> null", async () => {
        const f = fakeFetch({})
        expect(await fetchCrossrefCount("10.26629/x", f)).toBeNull()
        expect(await fetchOpenAlexCount("10.26629/x", f)).toBeNull()
    })
    it("503 throws", async () => {
        const f = fakeFetch({ crossref: () => json({}, 503), openalex: () => json({}, 503) })
        await expect(fetchCrossrefCount("10.26629/x", f)).rejects.toThrow("HTTP 503")
        await expect(fetchOpenAlexCount("10.26629/x", f)).rejects.toThrow("HTTP 503")
    })
    it("non-numeric -> null", async () => {
        const f = fakeFetch({ crossref: cr("5"), openalex: oa(null) })
        expect(await fetchCrossrefCount("10.26629/x", f)).toBeNull()
        expect(await fetchOpenAlexCount("10.26629/x", f)).toBeNull()
    })
})

describe("lookupCitationCount", () => {
    it("takes the max (openalex higher)", async () => {
        expect(await lookupCitationCount("10.26629/x", fakeFetch({ crossref: cr(5), openalex: oa(15) }))).toEqual({ count: 15, source: "openalex", partial: false })
    })
    it("tie -> crossref", async () => {
        expect(await lookupCitationCount("10.26629/x", fakeFetch({ crossref: cr(4), openalex: oa(4) }))).toEqual({ count: 4, source: "crossref", partial: false })
    })
    it("crossref higher -> crossref", async () => {
        expect(await lookupCitationCount("10.26629/x", fakeFetch({ crossref: cr(9), openalex: oa(2) }))).toEqual({ count: 9, source: "crossref", partial: false })
    })
    it("one source failing or 404 -> the other", async () => {
        expect(await lookupCitationCount("10.26629/x", fakeFetch({ crossref: () => json({}, 503), openalex: oa(3) }))).toEqual({ count: 3, source: "openalex", partial: true })
        expect(await lookupCitationCount("10.26629/x", fakeFetch({ crossref: cr(2), openalex: () => json({}, 404) }))).toEqual({ count: 2, source: "crossref", partial: false })
    })
    // First production run: new DOIs are unknown to both sources; they have 0 citations, not "no data".
    it("both not found -> 0 citations (a new DOI), not an error", async () => {
        expect(await lookupCitationCount("10.26629/x", fakeFetch({}))).toEqual({ count: 0, source: "crossref", partial: false })
    })
    it("retries once after HTTP 429 and uses the second answer", async () => {
        let calls = 0
        const f = fakeFetch({ crossref: () => (++calls === 1 ? json({}, 429) : json({ message: { "is-referenced-by-count": 3 } })), openalex: oa(1) })
        expect(await lookupCitationCount("10.26629/x", f)).toEqual({ count: 3, source: "crossref", partial: false })
        expect(calls).toBe(2)
    })
    it("both fail -> throws with both reasons", async () => {
        const f = fakeFetch({ crossref: () => json({}, 503), openalex: () => json({}, 404) })
        await expect(lookupCitationCount("10.26629/x", f)).rejects.toThrow("crossref: HTTP 503; openalex: not found")
    })
})

describe("refreshCitationCounts", () => {
    const far = () => Date.now() + 60_000

    it("processes least-recently-checked DOIs first (never-checked first)", async () => {
        const dois = ["10.26629/a", "10.26629/b", "10.26629/c"]
        prismaMock.articleCitationCount.findMany.mockResolvedValue([
            { doi: "10.26629/a", checked_at: new Date("2026-03-01") },
            { doi: "10.26629/b", checked_at: new Date("2026-01-01") },
        ])
        prismaMock.articleCitationCount.upsert.mockResolvedValue({})
        const f = fakeFetch({ crossref: cr(1), openalex: oa(1) })
        await refreshCitationCounts({ deadline: far(), dois, fetchImpl: f })
        const order = f.mock.calls
            .map((c: any) => c[0] as string)
            .filter((u) => u.startsWith("https://api.crossref.org/"))
            .map((u) => decodeURIComponent(u.split("/works/")[1]))
        expect(order).toEqual(["10.26629/c", "10.26629/b", "10.26629/a"])
    })

    it("success upsert sets count/source/fetched_at and clears error", async () => {
        prismaMock.articleCitationCount.findMany.mockResolvedValue([])
        const f = fakeFetch({ crossref: cr(2), openalex: oa(8) })
        const stats = await refreshCitationCounts({ deadline: far(), dois: ["10.26629/a"], fetchImpl: f })
        const arg = prismaMock.articleCitationCount.upsert.mock.calls[0][0]
        expect(arg.where).toEqual({ doi: "10.26629/a" })
        expect(arg.update).toMatchObject({ count: 8, source: "openalex", error: null })
        expect(arg.update.fetched_at).toBeInstanceOf(Date)
        expect(arg.update.checked_at).toBeInstanceOf(Date)
        expect(arg.create).toMatchObject({ doi: "10.26629/a", count: 8, source: "openalex" })
        expect(stats).toEqual({ total: 1, checked: 1, updated: 1, failed: 0, remaining: 0 })
    })

    it("failure upsert only sets checked_at + error (keeps count/fetched_at)", async () => {
        prismaMock.articleCitationCount.findMany.mockResolvedValue([])
        const f = fakeFetch({ crossref: () => json({}, 503), openalex: () => json({}, 503) })
        const stats = await refreshCitationCounts({ deadline: far(), dois: ["10.26629/a"], fetchImpl: f })
        const arg = prismaMock.articleCitationCount.upsert.mock.calls[0][0]
        expect(Object.keys(arg.update).sort()).toEqual(["checked_at", "error"])
        expect(arg.update.error).toContain("HTTP 503")
        expect(arg.create).toMatchObject({ count: 0, source: "crossref" })
        expect(arg.create.fetched_at).toBeUndefined()
        expect(stats).toEqual({ total: 1, checked: 1, updated: 0, failed: 1, remaining: 0 })
    })

    it("deadline in the past -> nothing checked, remaining = total", async () => {
        prismaMock.articleCitationCount.findMany.mockResolvedValue([])
        const f = fakeFetch({ crossref: cr(1) })
        const stats = await refreshCitationCounts({ deadline: Date.now() - 1, dois: ["10.26629/a", "10.26629/b"], fetchImpl: f })
        expect(stats).toEqual({ total: 2, checked: 0, updated: 0, failed: 0, remaining: 2 })
        expect(f).not.toHaveBeenCalled()
        expect(prismaMock.articleCitationCount.upsert).not.toHaveBeenCalled()
    })

    it("mixed totals", async () => {
        prismaMock.articleCitationCount.findMany.mockResolvedValue([])
        const f = vi.fn(async (url: string) => {
            if (url.includes(encodeURIComponent("10.26629/bad"))) return json({}, 503)
            return url.includes("crossref") ? cr(1)() : oa(1)()
        })
        const stats = await refreshCitationCounts({ deadline: far(), dois: ["10.26629/a", "10.26629/bad", "10.26629/c"], fetchImpl: f as any })
        expect(stats).toEqual({ total: 3, checked: 3, updated: 2, failed: 1, remaining: 0 })
    })
})

// Review of #254: a partial lookup (one source errored) must never lower a stored count.
describe("refreshCitationCounts: partial lookups", () => {
    it("keeps the higher stored count when one source errors and the other reports less", async () => {
        prismaMock.articleCitationCount.findMany.mockResolvedValue([{ doi: "10.26629/a", checked_at: new Date(0), count: 5 }])
        prismaMock.articleCitationCount.update.mockResolvedValue({})
        const f = fakeFetch({ crossref: () => json({}, 503), openalex: oa(0) })
        const stats = await refreshCitationCounts({ deadline: Date.now() + 60_000, dois: ["10.26629/a"], fetchImpl: f })
        expect(prismaMock.articleCitationCount.upsert).not.toHaveBeenCalled()
        const arg = prismaMock.articleCitationCount.update.mock.calls[0][0]
        expect(arg.where).toEqual({ doi: "10.26629/a" })
        expect(arg.data).not.toHaveProperty("count")
        expect(arg.data).not.toHaveProperty("fetched_at")
        expect(stats).toMatchObject({ checked: 1, updated: 0, failed: 0 })
    })
    it("still writes a partial result that is higher than the stored count", async () => {
        prismaMock.articleCitationCount.findMany.mockResolvedValue([{ doi: "10.26629/a", checked_at: new Date(0), count: 2 }])
        prismaMock.articleCitationCount.upsert.mockResolvedValue({})
        const f = fakeFetch({ crossref: () => json({}, 503), openalex: oa(7) })
        await refreshCitationCounts({ deadline: Date.now() + 60_000, dois: ["10.26629/a"], fetchImpl: f })
        expect(prismaMock.articleCitationCount.upsert.mock.calls[0][0].update).toMatchObject({ count: 7, source: "openalex" })
    })
    it("keeps going when recording a failure itself fails", async () => {
        prismaMock.articleCitationCount.findMany.mockResolvedValue([])
        prismaMock.articleCitationCount.upsert.mockRejectedValue(new Error("db down"))
        const f = fakeFetch({ crossref: () => json({}, 503), openalex: () => json({}, 503) })
        const stats = await refreshCitationCounts({ deadline: Date.now() + 60_000, dois: ["10.26629/a", "10.26629/b"], fetchImpl: f })
        expect(stats).toMatchObject({ checked: 2, failed: 2 })
    })
})

describe("getCitationCounts", () => {
    it("filters foreign/invalid, dedupes, queries fetched_at not null", async () => {
        prismaMock.articleCitationCount.findMany.mockResolvedValue([
            { doi: "10.26629/a", count: 3, source: "crossref", fetched_at: new Date("2026-01-01") },
        ])
        const out = await getCitationCounts(["10.26629/A", "https://doi.org/10.26629/a", "10.1000/x", "", "bad"])
        const arg = prismaMock.articleCitationCount.findMany.mock.calls[0][0]
        expect(arg.where).toEqual({ doi: { in: ["10.26629/a"] }, fetched_at: { not: null } })
        expect(out).toEqual([{ doi: "10.26629/a", count: 3, source: "crossref", fetched_at: new Date("2026-01-01") }])
    })
    it("caps at MAX_BATCH", async () => {
        expect(MAX_BATCH).toBe(50)
        prismaMock.articleCitationCount.findMany.mockResolvedValue([])
        await getCitationCounts(Array.from({ length: 80 }, (_, i) => `10.26629/d${i}`))
        expect(prismaMock.articleCitationCount.findMany.mock.calls[0][0].where.doi.in).toHaveLength(50)
    })
    it("returns [] without prisma when no valid DOIs", async () => {
        expect(await getCitationCounts(["10.1000/x", ""])).toEqual([])
        expect(prismaMock.articleCitationCount.findMany).not.toHaveBeenCalled()
    })
})
