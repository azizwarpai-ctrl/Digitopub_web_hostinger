import { describe, it, expect } from "vitest"
import {
  resolveTabSegments,
  journalTabPath,
  TAB_SEGMENTS,
  SEGMENT_TO_TAB,
  type JournalDetailTab,
} from "@/app/journals/[id]/tab-config"

describe("resolveTabSegments", () => {
  it("resolves each non-nestable tab segment", () => {
    expect(resolveTabSegments(["author-guidelines"])).toEqual({
      tab: "author",
      policySlug: null,
      aboutSlug: null,
    })
    expect(resolveTabSegments(["current-issue"])).toEqual({
      tab: "current",
      policySlug: null,
      aboutSlug: null,
    })
    expect(resolveTabSegments(["archive"])).toEqual({
      tab: "archive",
      policySlug: null,
      aboutSlug: null,
    })
  })

  it("resolves the policies tab with no sub-slug", () => {
    expect(resolveTabSegments(["policies"])).toEqual({
      tab: "policies",
      policySlug: null,
      aboutSlug: null,
    })
  })

  it("resolves the policies tab with a valid policy slug", () => {
    expect(resolveTabSegments(["policies", "privacy-statement"])).toEqual({
      tab: "policies",
      policySlug: "privacy-statement",
      aboutSlug: null,
    })
    expect(resolveTabSegments(["policies", "editorial-workflow"])).toEqual({
      tab: "policies",
      policySlug: "editorial-workflow",
      aboutSlug: null,
    })
  })

  it("accepts a well-formed dynamic policy slug from OJS (#182)", () => {
    expect(resolveTabSegments(["policies", "repository-policy"])).toEqual({
      tab: "policies",
      policySlug: "repository-policy",
      aboutSlug: null,
    })
  })

  it("rejects a malformed policy slug", () => {
    expect(resolveTabSegments(["policies", "Bad Slug!"])).toBeNull()
    expect(resolveTabSegments(["policies", "../etc/passwd"])).toBeNull()
    expect(resolveTabSegments(["policies", "-leading-dash"])).toBeNull()
    expect(resolveTabSegments(["policies", "a".repeat(81)])).toBeNull()
  })

  it("resolves the about-journal tab with no sub-slug", () => {
    expect(resolveTabSegments(["about-journal"])).toEqual({
      tab: "about",
      policySlug: null,
      aboutSlug: null,
    })
  })

  it("resolves the about-journal tab with a valid about slug", () => {
    expect(resolveTabSegments(["about-journal", "aims-scope"])).toEqual({
      tab: "about",
      policySlug: null,
      aboutSlug: "aims-scope",
    })
    expect(resolveTabSegments(["about-journal", "editorial-board"])).toEqual({
      tab: "about",
      policySlug: null,
      aboutSlug: "editorial-board",
    })
  })

  it("rejects an unknown about slug", () => {
    expect(resolveTabSegments(["about-journal", "bogus-about"])).toBeNull()
  })

  it("rejects an unknown top-level segment", () => {
    expect(resolveTabSegments(["bogus-tab"])).toBeNull()
    expect(resolveTabSegments(["author"])).toBeNull()
    expect(resolveTabSegments(["current"])).toBeNull()
  })

  it("rejects 'about' — it is the index route, 'about-journal' is the deep link alias", () => {
    expect(resolveTabSegments(["about"])).toBeNull()
  })

  it("rejects a sub-segment on a non-nestable tab", () => {
    expect(resolveTabSegments(["archive", "extra"])).toBeNull()
    expect(resolveTabSegments(["author-guidelines", "extra"])).toBeNull()
    expect(resolveTabSegments(["current-issue", "anything"])).toBeNull()
  })

  it("rejects paths deeper than two segments", () => {
    expect(resolveTabSegments(["policies", "privacy-statement", "deep"])).toBeNull()
    expect(resolveTabSegments(["about-journal", "aims-scope", "deep"])).toBeNull()
    expect(resolveTabSegments(["archive", "a", "b"])).toBeNull()
  })

  it("rejects an empty segment list", () => {
    expect(resolveTabSegments([])).toBeNull()
  })

  it("is case-sensitive", () => {
    expect(resolveTabSegments(["Archive"])).toBeNull()
    expect(resolveTabSegments(["Policies"])).toBeNull()
    expect(resolveTabSegments(["policies", "Privacy-Statement"])).toBeNull()
    expect(resolveTabSegments(["about-journal", "Aims-Scope"])).toBeNull()
  })
})

describe("journalTabPath", () => {
  it("maps About to the journal root (no segment)", () => {
    expect(journalTabPath("ojbr", "about")).toBe("/journals/ojbr")
  })

  it("maps each non-About tab to its descriptive segment", () => {
    expect(journalTabPath("ojbr", "author")).toBe("/journals/ojbr/author-guidelines")
    expect(journalTabPath("ojbr", "current")).toBe("/journals/ojbr/current-issue")
    expect(journalTabPath("ojbr", "archive")).toBe("/journals/ojbr/archive")
    expect(journalTabPath("ojbr", "policies")).toBe("/journals/ojbr/policies")
  })

  it("preserves the journal id verbatim (slug or numeric)", () => {
    expect(journalTabPath("42", "archive")).toBe("/journals/42/archive")
  })
})

describe("TAB_SEGMENTS / SEGMENT_TO_TAB consistency", () => {
  it("round-trips every non-About tab through segment and back", () => {
    const nonAboutTabs: JournalDetailTab[] = ["author", "current", "archive", "policies"]
    for (const tab of nonAboutTabs) {
      const segment = TAB_SEGMENTS[tab]
      expect(segment).not.toBe("")
      expect(SEGMENT_TO_TAB[segment]).toBe(tab)
    }
  })

  it("keeps About as the index (empty segment) and maps about-journal to about", () => {
    expect(TAB_SEGMENTS.about).toBe("")
    expect(SEGMENT_TO_TAB["about"]).toBeUndefined()
    expect(SEGMENT_TO_TAB["about-journal"]).toBe("about")
  })
})
