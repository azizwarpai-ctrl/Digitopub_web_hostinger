import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

let mockSession: { id: string; role: string } | null = null

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/src/lib/db/auth", () => ({
  getSession: vi.fn(() => mockSession),
  createSession: vi.fn(),
  destroySession: vi.fn(),
}))

const svc = vi.hoisted(() => ({
  listSpecializations: vi.fn(),
  createSpecialization: vi.fn(),
  updateSpecialization: vi.fn(),
  setJournalSpecialization: vi.fn(),
  retryJournalSpecializationSync: vi.fn(),
  getAllJournalSyncStatuses: vi.fn(),
  getJournalSpecialization: vi.fn(),
  pushAllSpecializationsToOjs: vi.fn(),
}))

vi.mock("@/src/features/journals/server/specialization-service", async () => {
  class SpecializationError extends Error {
    constructor(message: string, readonly status: number) {
      super(message)
    }
  }
  return { ...svc, SpecializationError }
})

import { specializationRouter } from "@/src/features/journals/server/specialization-route"
import { SpecializationError } from "@/src/features/journals/server/specialization-service"

const admin = { id: "3", role: "admin" }

function app() {
  const a = new Hono()
  a.route("/journals", specializationRouter)
  // Stand-in for the journals router's GET /:id, mounted after, as in route.ts.
  a.get("/journals/:id", (c) => c.json({ hit: "journal-detail" }))
  return a
}

const json = (body: unknown) => ({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

describe("journal specialization routes (#234)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSession = null
  })

  it("serves the active list publicly, before GET /journals/:id", async () => {
    svc.listSpecializations.mockResolvedValue([{ id: "1", name: "Dentistry", sort_order: 20, is_active: true, usage_count: 2 }])
    const res = await app().request("/journals/specializations")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: [{ id: "1", name: "Dentistry", sort_order: 20, is_active: true, usage_count: 2 }] })
    expect(svc.listSpecializations).toHaveBeenCalledWith({ includeInactive: false })
  })

  it.each([
    ["GET", "/journals/specializations/manage"],
    ["GET", "/journals/specializations/sync-status"],
    ["POST", "/journals/specializations"],
    ["PATCH", "/journals/specializations/1"],
    ["PUT", "/journals/5/specialization"],
    ["POST", "/journals/5/specialization/retry"],
  ])("%s %s requires a session", async (method, path) => {
    const res = await app().request(path, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" })
    expect(res.status).toBe(401)
  })

  it("rejects non-admin roles", async () => {
    mockSession = { id: "9", role: "editor" }
    const res = await app().request("/journals/5/specialization", json({ name: "Dentistry" }))
    expect(res.status).toBe(403)
    expect(svc.setJournalSpecialization).not.toHaveBeenCalled()
  })

  it("changes a journal's specialization and returns the sync state", async () => {
    mockSession = admin
    const sync = { state: "synced", attempts: 1, last_error: null, next_attempt_at: null, completed_at: "2026-10-26T10:00:00.000Z", updated_at: "2026-10-26T10:00:00.000Z" }
    svc.setJournalSpecialization.mockResolvedValue({ journal_id: "5", field: "Dentistry", sync })

    const res = await app().request("/journals/5/specialization", json({ name: "  Dentistry " }))

    expect(res.status).toBe(200)
    expect(svc.setJournalSpecialization).toHaveBeenCalledWith(5n, "Dentistry", 3n)
    expect((await res.json()).data).toEqual({ journal_id: "5", field: "Dentistry", sync })
  })

  it.each([
    [{}, "missing name"],
    [{ name: "" }, "empty name"],
    [{ name: "x".repeat(101) }, "too long"],
    [{ name: "Dent 🦷" }, "4-byte character"],
  ])("rejects %j (%s) with 400", async (body) => {
    mockSession = admin
    const res = await app().request("/journals/5/specialization", json(body))
    expect(res.status).toBe(400)
    expect(svc.setJournalSpecialization).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric journal id", async () => {
    mockSession = admin
    const res = await app().request("/journals/ijmp/specialization", json({ name: "Dentistry" }))
    expect(res.status).toBe(400)
  })

  it("maps service errors to their status", async () => {
    mockSession = admin
    svc.setJournalSpecialization.mockRejectedValue(new SpecializationError('"Astrology" is not an active specialization', 400))
    const res = await app().request("/journals/5/specialization", json({ name: "Astrology" }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ success: false, error: '"Astrology" is not an active specialization' })
  })

  it("hides unexpected errors behind a generic 500", async () => {
    mockSession = admin
    svc.setJournalSpecialization.mockRejectedValue(new Error("SQL secret detail"))
    const res = await app().request("/journals/5/specialization", json({ name: "Dentistry" }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain("SQL secret detail")
  })

  it("adds a specialization (201) and reports duplicates (409)", async () => {
    mockSession = admin
    svc.createSpecialization.mockResolvedValueOnce({ id: 20n, name: "Orthodontics", sort_order: 500, is_active: true })
    const ok = await app().request("/journals/specializations", { ...json({ name: "Orthodontics" }), method: "POST" })
    expect(ok.status).toBe(201)
    expect((await ok.json()).data).toMatchObject({ id: "20", name: "Orthodontics" })

    svc.createSpecialization.mockRejectedValueOnce(new SpecializationError('"Orthodontics" already exists', 409))
    const dup = await app().request("/journals/specializations", { ...json({ name: "orthodontics" }), method: "POST" })
    expect(dup.status).toBe(409)
  })

  it("renames a specialization and reports how many journals changed", async () => {
    mockSession = admin
    svc.updateSpecialization.mockResolvedValue({ specialization: { id: 2n, name: "Dental Medicine", sort_order: 20, is_active: true }, journalsUpdated: 3 })
    const res = await app().request("/journals/specializations/2", { ...json({ name: "Dental Medicine" }), method: "PATCH" })
    expect(res.status).toBe(200)
    expect(svc.updateSpecialization).toHaveBeenCalledWith(2n, { name: "Dental Medicine" }, 3n)
    expect((await res.json()).data.journals_updated).toBe(3)
  })

  it("refuses an empty PATCH", async () => {
    mockSession = admin
    const res = await app().request("/journals/specializations/2", { ...json({}), method: "PATCH" })
    expect(res.status).toBe(400)
  })

  it("loads one journal by numeric id for the edit page (admin only)", async () => {
    expect((await app().request("/journals/3/specialization")).status).toBe(401)

    mockSession = admin
    svc.getJournalSpecialization.mockResolvedValue({ journal_id: "3", title: "J3", field: "General Science", ojs_id: "4", ojs_path: "jirdm", sync: { state: "never" } })
    const res = await app().request("/journals/3/specialization")
    expect(res.status).toBe(200)
    expect(svc.getJournalSpecialization).toHaveBeenCalledWith(3n)
    expect((await res.json()).data).toMatchObject({ journal_id: "3", ojs_id: "4" })
  })

  it("pushes all journals to OJS (admin only)", async () => {
    expect((await app().request("/journals/specializations/push-all", { method: "POST" })).status).toBe(401)
    mockSession = admin
    svc.pushAllSpecializationsToOjs.mockResolvedValue({ queued: 13, synced: 12, pending: 1, failed: 0 })
    const res = await app().request("/journals/specializations/push-all", { method: "POST" })
    expect(res.status).toBe(200)
    expect(svc.pushAllSpecializationsToOjs).toHaveBeenCalledWith(3n)
    expect((await res.json()).data).toEqual({ queued: 13, synced: 12, pending: 1, failed: 0 })
  })

  it("retries the OJS sync for a journal", async () => {
    mockSession = admin
    svc.retryJournalSpecializationSync.mockResolvedValue({ state: "pending", attempts: 1, last_error: "HTTP 503: down" })
    const res = await app().request("/journals/5/specialization/retry", { method: "POST" })
    expect(res.status).toBe(200)
    expect(svc.retryJournalSpecializationSync).toHaveBeenCalledWith(5n)
  })
})
