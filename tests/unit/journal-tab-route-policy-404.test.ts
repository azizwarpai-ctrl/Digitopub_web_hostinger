import { describe, it, expect, vi, beforeEach } from "vitest"

// The page component itself must 404 an unknown dynamic policy slug —
// relying on generateMetadata alone is not enough once metadata streams.

const hoisted = vi.hoisted(() => ({
  fetchJournalPolicies: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

vi.mock("next/navigation", () => ({ notFound: hoisted.notFound }))
vi.mock("@/src/lib/db/config", () => ({ prisma: { journal: { findFirst: vi.fn(), findUnique: vi.fn() } } }))
vi.mock("@/src/features/journals/server/resolve-journal", () => ({
  resolveJournalOjsId: vi.fn(async () => ({ found: true, ojsId: "2", prismaId: null, ojsPath: "ojbr" })),
}))
vi.mock("@/src/features/ojs/server/ojs-client", () => ({ isOjsConfigured: () => true }))
vi.mock("@/src/features/journals/server/journal-policies-service", () => ({
  fetchJournalPolicies: hoisted.fetchJournalPolicies,
}))
vi.mock("@/app/journals/[id]/journal-detail-view", () => ({ JournalDetailView: () => null }))

const OJBR_TABS = [
  { slug: "privacy-statement", title: "Privacy Statement", content: "<p>p</p>" },
  { slug: "repository-policy", title: "Repository Policy (Self-Archiving Policy)", content: "<p>r</p>" },
]

async function renderRoute(tab: string[]) {
  const { default: JournalTabRoute } = await import("@/app/journals/[id]/[...tab]/page")
  return JournalTabRoute({ params: Promise.resolve({ id: "ojbr", tab }) })
}

// First import of the route transforms a large module graph — allow for it.
describe("journal tab route — dynamic policy slugs", { timeout: 60_000 }, () => {
  beforeEach(() => {
    vi.resetModules()
    hoisted.notFound.mockClear()
    hoisted.fetchJournalPolicies.mockReset()
    hoisted.fetchJournalPolicies.mockResolvedValue({ tabs: OJBR_TABS })
  })

  it("404s from the page component when OJS has no such policy", async () => {
    await expect(renderRoute(["policies", "does-not-exist"])).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("renders a dynamic policy that OJS returned", async () => {
    await expect(renderRoute(["policies", "repository-policy"])).resolves.toBeTruthy()
    expect(hoisted.notFound).not.toHaveBeenCalled()
  })

  it("does not query OJS for a known policy slug", async () => {
    await renderRoute(["policies", "privacy-statement"])
    expect(hoisted.fetchJournalPolicies).not.toHaveBeenCalled()
  })
})
