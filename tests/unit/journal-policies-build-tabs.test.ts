import { describe, it, expect, vi } from "vitest"
import {
  buildPolicyTabs,
  type PolicySourceRows,
} from "@/src/features/journals/server/journal-policies-service"

// Fixture mirrors the real OJS rows for journal `ojbr` (context_id 2) as of
// 2026-10-18: every policy page is an unassigned standalone nav item, the
// built-in Privacy item (id 39) has no path and resolves from journal_settings.

type NavRow = PolicySourceRows["standaloneNavRows"][number]

function navItem(
  id: number,
  path: string | null,
  title: string | null,
  content: string | null,
  type = "NMI_TYPE_CUSTOM",
): NavRow[] {
  const rows: NavRow[] = []
  if (title !== null) {
    rows.push({ navigation_menu_item_id: id, path, type, setting_name: "title", setting_value: title, locale: "en" })
  }
  if (content !== null) {
    rows.push({ navigation_menu_item_id: id, path, type, setting_name: "content", setting_value: content, locale: "en" })
  }
  if (rows.length === 0) {
    rows.push({ navigation_menu_item_id: id, path, type, setting_name: null as unknown as string, setting_value: null, locale: "" })
  }
  return rows
}

function ojbrRows(): PolicySourceRows {
  return {
    primaryLocale: "en",
    menuRows: [],
    staticPageRows: [],
    policySettingRows: [
      { setting_name: "privacyStatement", setting_value: "<p>Privacy body</p>", locale: "en" },
    ],
    standaloneNavRows: [
      ...navItem(39, null, null, null, "NMI_TYPE_PRIVACY"),
      ...navItem(42, "policies", "Journal Policies", ""),
      ...navItem(110, "journal-information", "Journal Information", "<p>Info</p>"),
      ...navItem(111, "editorial-board", "Editorial Board", "<p>Board</p>"),
      ...navItem(112, "advisory-board", "Advisory Board", "<p>Advisors</p>"),
      ...navItem(113, "copyright-licensing-policies", "Copyright & Licensing Policies", "<p>Copyright body</p>"),
      ...navItem(114, "editorial-workflow", "Editorial Workflow", "<p>Workflow body</p>"),
      ...navItem(115, "indexing-archiving", "Indexing & Archiving", "<p>Indexing body</p>"),
      ...navItem(116, "dois-orcid", "DOIs & ORCID", "<p>DOI body</p>"),
      ...navItem(117, "author-guidelines", "Author Guidelines", "<p>Guidelines</p>"),
      ...navItem(118, "publication-fees", "Publication Fees", "<p>Fees</p>"),
      ...navItem(119, "for-authors", "For Authors", ""),
      ...navItem(190, "policies-on-ethics", "Policies on Ethics", "<p>Ethics body</p>"),
      ...navItem(250, "aims-scope", "Aims & Scope", "<p>Aims</p>"),
      ...navItem(390, "repository-policy", "Repository Policy (Self-Archiving Policy)", "<p>Repository body</p>"),
    ],
  }
}

type MenuRowT = PolicySourceRows["menuRows"][number]

/**
 * Rows for one item assigned to the journal's "Journal Policies" menu. Like
 * the real SQL (menu ⋈ item ⋈ LEFT JOIN item settings), each menu row carries
 * the item's own settings — taken here from the ojbr standalone fixture.
 */
function menuItem(id: number, seq: number, parentSeq: number | null = null): MenuRowT[] {
  const itemRows = ojbrRows().standaloneNavRows.filter((r) => r.navigation_menu_item_id === id)
  if (itemRows.length === 0) throw new Error(`fixture has no nav item ${id}`)
  return itemRows.map((r) => ({
    navigation_menu_item_id: id,
    slug: r.path as string,
    type: r.type,
    seq,
    parent_seq: parentSeq,
    setting_name: r.setting_name as string,
    setting_value: r.setting_value,
    locale: r.locale,
  }))
}

describe("buildPolicyTabs — editor-controlled order via a 'Journal Policies' menu", () => {
  it("orders tabs by the menu, then appends unlisted policies in creation order", () => {
    const rows = ojbrRows()
    rows.menuRows = [
      ...menuItem(190, 0), // Policies on Ethics
      ...menuItem(390, 1), // Repository Policy
      ...menuItem(39, 2), // built-in Privacy (content from journal_settings)
      ...menuItem(113, 3), // Copyright & Licensing
    ]
    expect(buildPolicyTabs(rows).map((t) => t.slug)).toEqual([
      "policies-on-ethics",
      "repository-policy",
      "privacy-statement",
      "copyright-licensing",
      // not in the menu → after it, OJS creation order
      "editorial-workflow",
      "indexing-archiving",
      "dois-orcid",
    ])
  })

  it("orders nested items within their parent and never shows the parent container", () => {
    const rows = ojbrRows()
    rows.menuRows = [
      ...menuItem(42, 0), // "Journal Policies" dropdown parent
      ...menuItem(113, 1, 0), // child #2
      ...menuItem(190, 0, 0), // child #1
      ...menuItem(390, 1), // top-level, after the dropdown
    ]
    const slugs = buildPolicyTabs(rows).map((t) => t.slug)
    expect(slugs.slice(0, 3)).toEqual(["policies-on-ethics", "copyright-licensing", "repository-policy"])
    expect(slugs).not.toContain("policies")
  })

  it("does not warn about duplicates when an item is both in the menu and standalone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const rows = ojbrRows()
    rows.menuRows = [...menuItem(39, 0), ...menuItem(390, 1)]
    buildPolicyTabs(rows)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe("buildPolicyTabs — dynamic OJS policies (#182)", () => {
  it("includes a policy page that is not in the known list (Repository Policy)", () => {
    const tabs = buildPolicyTabs(ojbrRows())
    const repo = tabs.find((t) => t.slug === "repository-policy")
    expect(repo).toBeDefined()
    expect(repo?.title).toBe("Repository Policy (Self-Archiving Policy)")
    expect(repo?.content).toContain("Repository body")
  })

  it("orders tabs by OJS creation order (navigation_menu_item_id)", () => {
    const tabs = buildPolicyTabs(ojbrRows())
    expect(tabs.map((t) => t.slug)).toEqual([
      "privacy-statement",
      "copyright-licensing",
      "editorial-workflow",
      "indexing-archiving",
      "dois-orcid",
      "policies-on-ethics",
      "repository-policy",
    ])
  })

  it("excludes non-policy pages and empty containers", () => {
    const slugs = buildPolicyTabs(ojbrRows()).map((t) => t.slug)
    for (const excluded of [
      "policies",
      "journal-information",
      "editorial-board",
      "advisory-board",
      "author-guidelines",
      "publication-fees",
      "for-authors",
      "aims-scope",
    ]) {
      expect(slugs).not.toContain(excluded)
    }
  })

  it("excludes a 'Journal Policies' container even when it carries content", () => {
    const rows = ojbrRows()
    rows.standaloneNavRows.push(...navItem(500, "journal-policies", "Journal Policies", "<p>See tabs</p>"))
    const slugs = buildPolicyTabs(rows).map((t) => t.slug)
    expect(slugs).not.toContain("journal-policies")
  })

  it("keeps a real policy whose path happens to be 'policies' (only container titles are excluded)", () => {
    const rows = ojbrRows()
    rows.standaloneNavRows = rows.standaloneNavRows.filter((r) => r.navigation_menu_item_id !== 42)
    rows.standaloneNavRows.push(...navItem(42, "policies", "Data Availability Policy", "<p>Data body</p>"))
    const tab = buildPolicyTabs(rows).find((t) => t.content.includes("Data body"))
    expect(tab?.slug).toBe("policies")
    expect(tab?.title).toBe("Data Availability Policy")
  })

  it("excludes an item titled 'Journal Policies' whatever its path", () => {
    const rows = ojbrRows()
    rows.standaloneNavRows.push(...navItem(501, "jp", "Journal Policies", "<p>Container</p>"))
    expect(buildPolicyTabs(rows).map((t) => t.slug)).not.toContain("jp")
  })

  it("warns when two different OJS pages map to the same known policy", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const rows = ojbrRows()
    rows.standaloneNavRows.push(...navItem(600, "peer-review-policy", "Peer Review Policy", "<p>Peer body</p>"))
    const workflow = buildPolicyTabs(rows).filter((t) => t.slug === "editorial-workflow")
    expect(workflow).toHaveLength(1)
    expect(workflow[0].content).toContain("Workflow body")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Editorial Workflow"'))
    warn.mockRestore()
  })

  it("does not warn when a nav page and its settings fallback both supply a known policy", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const rows = ojbrRows()
    rows.policySettingRows.push({ setting_name: "copyrightNotice", setting_value: "<p>Notice</p>", locale: "en" })
    buildPolicyTabs(rows)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("keeps canonical slug and title for known policies when the OJS path differs", () => {
    const tabs = buildPolicyTabs(ojbrRows())
    const copyright = tabs.find((t) => t.content.includes("Copyright body"))
    expect(copyright?.slug).toBe("copyright-licensing")
    expect(copyright?.title).toBe("Copyright & Licensing Policies")
  })

  it("treats any page whose title or path mentions 'policy' as a policy", () => {
    const rows = ojbrRows()
    rows.standaloneNavRows.push(...navItem(400, "data-sharing", "Data Sharing Policy", "<p>Data body</p>"))
    rows.standaloneNavRows.push(...navItem(401, "ai-policy", "Use of AI Tools", "<p>AI body</p>"))
    const slugs = buildPolicyTabs(rows).map((t) => t.slug)
    expect(slugs.slice(-3)).toEqual(["repository-policy", "data-sharing", "ai-policy"])
  })

  it("appends settings-only policies (no nav item) after nav-item policies", () => {
    const rows = ojbrRows()
    rows.standaloneNavRows = rows.standaloneNavRows.filter((r) => r.navigation_menu_item_id !== 114)
    rows.policySettingRows.push({ setting_name: "reviewPolicy", setting_value: "<p>Review from settings</p>", locale: "en" })
    const slugs = buildPolicyTabs(rows).map((t) => t.slug)
    expect(slugs[slugs.length - 1]).toBe("editorial-workflow")
  })

  it("deduplicates a nav item and static page sharing the same path", () => {
    const rows = ojbrRows()
    rows.staticPageRows.push(
      { static_page_id: 7, path: "repository-policy", setting_name: "title", setting_value: "Repository Policy", locale: "en" },
      { static_page_id: 7, path: "repository-policy", setting_name: "content", setting_value: "<p>Static copy</p>", locale: "en" },
    )
    const tabs = buildPolicyTabs(rows)
    const repoTabs = tabs.filter((t) => t.slug.startsWith("repository-policy"))
    expect(repoTabs).toHaveLength(1)
    expect(repoTabs[0].content).toContain("Repository body")
  })

  it("returns no tabs when OJS returned nothing", () => {
    expect(
      buildPolicyTabs({ primaryLocale: "en", menuRows: [], standaloneNavRows: [], policySettingRows: [], staticPageRows: [] }),
    ).toEqual([])
  })
})
