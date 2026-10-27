import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  journalFindUnique: vi.fn(),
  journalUpdate: vi.fn(),
  journalFindMany: vi.fn(),
  settingUpsert: vi.fn(),
  ojsQuery: vi.fn(),
}))

vi.mock("@/src/lib/db/config", () => ({
  prisma: {
    journal: { findUnique: h.journalFindUnique, update: h.journalUpdate, findMany: h.journalFindMany },
    systemSetting: { upsert: h.settingUpsert },
  },
}))
vi.mock("@/src/features/ojs/server/ojs-client", () => ({ ojsQuery: h.ojsQuery }))

import { chooseCoverUrl, probeCoverUrl, type CoverProbe } from "@/src/features/ojs/server/cover-check"
import { syncOjsJournals } from "@/src/features/ojs/server/sync-ojs-journals"

const GOOD = "https://journals.digitopub.com/public/journals/1/homepageImage_en.png"
const BAD = "https://journals.digitopub.com/public/journals/1/Journal%20Cover%20Image.png"

const reply = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers })

describe("probeCoverUrl (#239)", () => {
  it("is ok for an image that loads", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(200, { "content-type": "image/png" }))
    expect(await probeCoverUrl(GOOD, { fetchImpl })).toBe("ok")
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "HEAD", redirect: "manual" })
    // Same browser-like headers as /api/image-proxy: OJS nginx blocks bots.
    expect(fetchImpl.mock.calls[0][1].headers["User-Agent"]).toMatch(/^Mozilla\//)
  })

  it.each([404, 410])("is broken for %i", async (status) => {
    expect(await probeCoverUrl(BAD, { fetchImpl: vi.fn().mockResolvedValue(reply(status)) })).toBe("broken")
  })

  it("is broken for an HTML page served with 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(200, { "content-type": "text/html; charset=utf-8" }))
    expect(await probeCoverUrl(GOOD, { fetchImpl })).toBe("broken")
  })

  it("follows a redirect that stays on an OJS host", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply(301, { location: GOOD }))
      .mockResolvedValueOnce(reply(200, { "content-type": "image/png" }))
    expect(await probeCoverUrl("https://submitmanager.com/public/journals/1/homepageImage_en.png", { fetchImpl })).toBe("ok")
  })

  it("does not follow a redirect to a foreign host", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(302, { location: "https://evil.example/x.png" }))
    expect(await probeCoverUrl(GOOD, { fetchImpl })).toBe("unknown")
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it("never requests a non-OJS host (no SSRF)", async () => {
    const fetchImpl = vi.fn()
    expect(await probeCoverUrl("http://169.254.169.254/latest/meta-data", { fetchImpl })).toBe("unknown")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("is unknown on network errors and timeouts, missing without a URL", async () => {
    expect(await probeCoverUrl(GOOD, { fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNRESET")) })).toBe("unknown")
    expect(await probeCoverUrl(null)).toBe("missing")
  })
})

describe("chooseCoverUrl (#239)", () => {
  const probes = (map: Record<string, CoverProbe>) => async (u: string | null) => (u ? map[u] : "missing") as CoverProbe

  it("keeps the working cover when the new URL is broken (the 2026-10-26 regression)", async () => {
    expect(await chooseCoverUrl(GOOD, BAD, probes({ [GOOD]: "ok", [BAD]: "broken" }))).toEqual({ url: GOOD, decision: "kept_old", probe: "ok" })
  })

  it("keeps the working cover when OJS suddenly reports none", async () => {
    expect(await chooseCoverUrl(GOOD, null, probes({ [GOOD]: "ok" }))).toMatchObject({ url: GOOD, decision: "kept_old" })
  })

  it("takes a new URL that loads", async () => {
    expect(await chooseCoverUrl(BAD, GOOD, probes({ [GOOD]: "ok", [BAD]: "broken" }))).toEqual({ url: GOOD, decision: "updated", probe: "ok" })
  })

  it("takes the new URL when it cannot be checked (a transient error must not freeze a cover)", async () => {
    expect(await chooseCoverUrl(GOOD, BAD, probes({ [GOOD]: "ok", [BAD]: "unknown" }))).toMatchObject({ url: BAD, decision: "updated" })
  })

  it("takes the new URL when the old one is broken too", async () => {
    expect(await chooseCoverUrl(GOOD, BAD, probes({ [GOOD]: "broken", [BAD]: "broken" }))).toMatchObject({ url: BAD, decision: "updated", probe: "broken" })
  })

  it("reports an unchanged URL's state", async () => {
    expect(await chooseCoverUrl(BAD, BAD, probes({ [BAD]: "broken" }))).toEqual({ url: BAD, decision: "unchanged", probe: "broken" })
  })
})

describe("syncOjsJournals cover guard (#239)", () => {
  beforeEach(() => {
    for (const fn of Object.values(h)) fn.mockReset()
    h.journalUpdate.mockImplementation(async ({ data }) => data)
    h.journalFindMany.mockResolvedValue([])
    h.settingUpsert.mockResolvedValue({})
    h.ojsQuery.mockResolvedValue([
      { scope: "journals", c: 1, s: "1" },
      { scope: "settings", c: 1, s: "1" },
    ])
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) =>
      String(url) === GOOD ? reply(200, { "content-type": "image/png" }) : reply(404)
    ))
  })

  it("does not overwrite a working cover with a 404 URL, and reports it", async () => {
    h.journalFindUnique.mockResolvedValue({ id: 1n, ojs_id: "1", ojs_path: "jod", cover_image_url: GOOD })

    const result = await syncOjsJournals([
      { journal_id: 1, path: "jod", primary_locale: "en", enabled: true, name: "J", description: null, thumbnail_url: BAD },
    ])

    expect(h.journalUpdate.mock.calls[0][0].data.cover_image_url).toBe(GOOD)
    expect(result.covers).toEqual({ checked: 1, ok: 1, broken: [], kept_old: ["jod"] })
    // Not a finished sync: no fingerprint, so the next drift check retries.
    expect(h.settingUpsert).not.toHaveBeenCalled()
  })

  it("repairs a broken stored cover when OJS gives a working one", async () => {
    h.journalFindUnique.mockResolvedValue({ id: 1n, ojs_id: "1", ojs_path: "jod", cover_image_url: BAD })

    const result = await syncOjsJournals([
      { journal_id: 1, path: "jod", primary_locale: "en", enabled: true, name: "J", description: null, thumbnail_url: GOOD },
    ])

    expect(h.journalUpdate.mock.calls[0][0].data.cover_image_url).toBe(GOOD)
    expect(result.covers).toMatchObject({ ok: 1, broken: [], kept_old: [] })
    expect(h.settingUpsert).toHaveBeenCalled()
  })
})
