import { describe, it, expect } from "vitest"
import {
  normalizePolicyKey,
  matchApprovedPolicy,
  isValidPolicySlug,
  getPolicyTitleBySlug,
  APPROVED_POLICY_SLUGS,
  slugifyPolicyPath,
} from "@/src/features/journals/server/journal-policies-service"
import { isPolicySlugShape, resolvePolicyRoute } from "@/src/features/journals/policy-slugs"

describe("normalizePolicyKey", () => {
  it("lowercases and trims", () => {
    expect(normalizePolicyKey("  Privacy Statement  ")).toBe("privacy statement")
  })

  it("treats & as 'and'", () => {
    expect(normalizePolicyKey("Copyright & Licensing")).toBe(
      "copyright and licensing",
    )
  })

  it("collapses punctuation to single spaces", () => {
    expect(normalizePolicyKey("dois-orcid")).toBe("dois orcid")
    expect(normalizePolicyKey("DOIs/ORCID")).toBe("dois orcid")
    expect(normalizePolicyKey("ethics_policy")).toBe("ethics policy")
  })

  it("returns empty string for null/undefined/empty", () => {
    expect(normalizePolicyKey(null)).toBe("")
    expect(normalizePolicyKey(undefined)).toBe("")
    expect(normalizePolicyKey("")).toBe("")
    expect(normalizePolicyKey("   ")).toBe("")
  })

  it("resolves all three DOIs & ORCID forms to the same approved policy", () => {
    const a = matchApprovedPolicy(["dois-orcid"])
    const b = matchApprovedPolicy(["DOIs & ORCID"])
    const c = matchApprovedPolicy(["dois and orcid"])
    expect(a?.slug).toBe("dois-orcid")
    expect(b?.slug).toBe("dois-orcid")
    expect(c?.slug).toBe("dois-orcid")
  })
})

describe("matchApprovedPolicy", () => {
  it("matches Privacy Statement via canonical title", () => {
    const policy = matchApprovedPolicy(["Privacy Statement"])
    expect(policy?.slug).toBe("privacy-statement")
  })

  it("matches Privacy Statement via privacyStatement setting name", () => {
    const policy = matchApprovedPolicy([null, null, null, "privacyStatement"])
    expect(policy?.slug).toBe("privacy-statement")
  })

  it("matches Copyright & Licensing via alternative wordings", () => {
    expect(matchApprovedPolicy(["copyright and licensing"])?.slug).toBe(
      "copyright-licensing",
    )
    expect(matchApprovedPolicy(["Copyright Notice"])?.slug).toBe(
      "copyright-licensing",
    )
    expect(matchApprovedPolicy(["copyrightNotice"])?.slug).toBe(
      "copyright-licensing",
    )
  })

  it("matches Policies on Ethics via ethics alias", () => {
    expect(matchApprovedPolicy(["Publication Ethics"])?.slug).toBe(
      "policies-on-ethics",
    )
    expect(matchApprovedPolicy(["ethics"])?.slug).toBe("policies-on-ethics")
  })

  it("matches Editorial Workflow via peer review wording", () => {
    expect(matchApprovedPolicy(["Peer Review Process"])?.slug).toBe(
      "editorial-workflow",
    )
    expect(matchApprovedPolicy(["reviewPolicy"])?.slug).toBe(
      "editorial-workflow",
    )
  })

  it("matches Indexing & Archiving via archiving alias", () => {
    expect(matchApprovedPolicy(["Archiving Policy"])?.slug).toBe(
      "indexing-archiving",
    )
    expect(matchApprovedPolicy(["authorSelfArchivePolicy"])?.slug).toBe(
      "indexing-archiving",
    )
  })

  it("matches DOIs & ORCID across slug, title and text forms", () => {
    expect(matchApprovedPolicy(["dois-orcid"])?.slug).toBe("dois-orcid")
    expect(matchApprovedPolicy(["DOIs & ORCID"])?.slug).toBe("dois-orcid")
    expect(matchApprovedPolicy(["dois and orcid"])?.slug).toBe("dois-orcid")
    expect(matchApprovedPolicy(["doi"])?.slug).toBe("dois-orcid")
  })

  it("rejects unrelated OJS pages", () => {
    expect(matchApprovedPolicy(["About the Journal"])).toBeNull()
    expect(matchApprovedPolicy(["Editorial Board"])).toBeNull()
    expect(matchApprovedPolicy(["Contact"])).toBeNull()
    expect(matchApprovedPolicy(["Submissions"])).toBeNull()
    expect(matchApprovedPolicy(["Announcements"])).toBeNull()
  })

  it("returns null when all candidates are empty/nullish", () => {
    expect(matchApprovedPolicy([null, undefined, ""])).toBeNull()
  })

  it("takes the first matching candidate when multiple are provided", () => {
    // Title mismatches but setting name matches → still matches
    const policy = matchApprovedPolicy([
      "some-unrelated-thing",
      null,
      null,
      "privacyStatement",
    ])
    expect(policy?.slug).toBe("privacy-statement")
  })
})

describe("APPROVED_POLICY_SLUGS", () => {
  it("contains exactly the six canonical policy slugs in fixed order", () => {
    expect(APPROVED_POLICY_SLUGS).toEqual([
      "privacy-statement",
      "policies-on-ethics",
      "copyright-licensing",
      "editorial-workflow",
      "indexing-archiving",
      "dois-orcid",
    ])
  })
})

describe("isValidPolicySlug", () => {
  it("accepts every canonical slug", () => {
    for (const slug of APPROVED_POLICY_SLUGS) {
      expect(isValidPolicySlug(slug)).toBe(true)
    }
  })

  it("rejects unknown slugs", () => {
    expect(isValidPolicySlug("about")).toBe(false)
    expect(isValidPolicySlug("privacy")).toBe(false)
    expect(isValidPolicySlug("Privacy-Statement")).toBe(false)
    expect(isValidPolicySlug("../etc/passwd")).toBe(false)
  })

  it("rejects empty / null / undefined", () => {
    expect(isValidPolicySlug("")).toBe(false)
    expect(isValidPolicySlug(null)).toBe(false)
    expect(isValidPolicySlug(undefined)).toBe(false)
  })

  it("is case-sensitive (canonical lowercase only)", () => {
    expect(isValidPolicySlug("PRIVACY-STATEMENT")).toBe(false)
    expect(isValidPolicySlug("Privacy-Statement")).toBe(false)
  })
})

describe("isPolicySlugShape", () => {
  it("accepts lowercase kebab-case slugs", () => {
    expect(isPolicySlugShape("repository-policy")).toBe(true)
    expect(isPolicySlugShape("privacy-statement")).toBe(true)
    expect(isPolicySlugShape("ai2-policy")).toBe(true)
  })

  it("rejects malformed slugs", () => {
    expect(isPolicySlugShape("")).toBe(false)
    expect(isPolicySlugShape(null)).toBe(false)
    expect(isPolicySlugShape("Repository-Policy")).toBe(false)
    expect(isPolicySlugShape("repository--policy")).toBe(false)
    expect(isPolicySlugShape("-repository")).toBe(false)
    expect(isPolicySlugShape("../etc/passwd")).toBe(false)
    expect(isPolicySlugShape("a".repeat(81))).toBe(false)
  })
})

describe("slugifyPolicyPath", () => {
  it("kebab-cases OJS paths and titles", () => {
    expect(slugifyPolicyPath("repository-policy")).toBe("repository-policy")
    expect(slugifyPolicyPath("Repository Policy (Self-Archiving Policy)")).toBe(
      "repository-policy-self-archiving-policy",
    )
    expect(slugifyPolicyPath("Data_Sharing & Reuse")).toBe("data-sharing-and-reuse")
  })

  it("returns empty string when nothing usable remains", () => {
    expect(slugifyPolicyPath("!!!")).toBe("")
    expect(slugifyPolicyPath(null)).toBe("")
  })
})

describe("resolvePolicyRoute", () => {
  const tabs = [
    { slug: "privacy-statement", title: "Privacy Statement" },
    { slug: "repository-policy", title: "Repository Policy (Self-Archiving Policy)" },
  ]

  const loadTabs = async () => tabs

  it("uses the fetched OJS title for a dynamic slug", async () => {
    expect(await resolvePolicyRoute("repository-policy", loadTabs)).toEqual({
      found: true,
      title: "Repository Policy (Self-Archiving Policy)",
    })
  })

  it("is not found when OJS returned tabs and the slug is absent", async () => {
    expect(await resolvePolicyRoute("no-such-policy", loadTabs)).toEqual({ found: false })
  })

  it("keeps known slugs resolvable without loading tabs", async () => {
    let loaded = false
    const result = await resolvePolicyRoute("dois-orcid", async () => {
      loaded = true
      return tabs
    })
    expect(result).toEqual({ found: true, title: "DOIs & ORCID" })
    expect(loaded).toBe(false)
  })

  it("does not 404 when OJS is unavailable (no tabs)", async () => {
    expect(await resolvePolicyRoute("repository-policy", async () => null)).toEqual({ found: true, title: null })
    expect(await resolvePolicyRoute("repository-policy", async () => [])).toEqual({ found: true, title: null })
  })
})

describe("getPolicyTitleBySlug", () => {
  it("returns the canonical title for each approved slug", () => {
    expect(getPolicyTitleBySlug("privacy-statement")).toBe("Privacy Statement")
    expect(getPolicyTitleBySlug("policies-on-ethics")).toBe("Policies on Ethics")
    expect(getPolicyTitleBySlug("copyright-licensing")).toBe(
      "Copyright & Licensing Policies",
    )
    expect(getPolicyTitleBySlug("editorial-workflow")).toBe("Editorial Workflow")
    expect(getPolicyTitleBySlug("indexing-archiving")).toBe("Indexing & Archiving")
    expect(getPolicyTitleBySlug("dois-orcid")).toBe("DOIs & ORCID")
  })

  it("returns null for unknown slugs", () => {
    expect(getPolicyTitleBySlug("nonexistent")).toBeNull()
    expect(getPolicyTitleBySlug("")).toBeNull()
  })
})
