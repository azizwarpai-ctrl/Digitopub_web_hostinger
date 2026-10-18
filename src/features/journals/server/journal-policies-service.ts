/**
 * Journal Policies Service
 *
 * Emits the journal's policy tabs from OJS, in OJS creation order (#182).
 *
 * Data is discovered across multiple OJS sources:
 *   1. Navigation menu system — the "Journal Policies" custom menu
 *   2. Standalone navigation_menu_items (custom pages + built-in Privacy)
 *   3. journal_settings — standard policy fields
 *   4. static_pages — plugin-managed content pages
 *
 * A candidate becomes a tab when it either matches a KNOWN policy
 * (APPROVED_POLICIES — canonical slug/title, aliases, settings fallbacks) or
 * its title/path mentions "policy"/"policies". Everything else (Journal
 * Information, Editorial Board, Author Guidelines, …) is dropped, as are
 * empty containers such as the "Journal Policies" parent item.
 *
 * Tabs are ordered by the navigation_menu_item_id of the OJS page that backs
 * them (i.e. the order editors created them in SubmitManager). Static pages
 * follow nav items; policies that exist only in journal_settings come last.
 */

import sanitizeHtml from "sanitize-html"
import { getJournalPrimaryLocale, ojsQuery } from "@/src/features/ojs/server/ojs-client"
import { rewriteOjsInlineImages } from "@/src/features/ojs/utils/rewrite-inline-images"
import { MAX_POLICY_SLUG_LENGTH, POLICY_METADATA } from "@/src/features/journals/policy-slugs"

export {
  APPROVED_POLICY_SLUGS,
  isValidPolicySlug,
  getPolicyTitleBySlug,
} from "@/src/features/journals/policy-slugs"

// ── Public types ────────────────────────────────────────────────────────────

export interface PolicyTab {
  title: string
  slug: string
  content: string
}

export interface JournalPolicies {
  tabs: PolicyTab[]
  /** Whether DOI registration is enabled for this journal */
  doiEnabled: boolean
  /** Whether authors are required to declare competing interests */
  requireAuthorCompetingInterestsEnabled: boolean
}

// ── OJS row types (exported for buildPolicyTabs callers and tests) ──────────

export interface SettingRow {
  setting_name: string
  setting_value: string | null
  locale: string
}

export interface MenuRow {
  navigation_menu_item_id: number
  slug: string
  type: string
  /** Position among siblings in the "Journal Policies" menu */
  seq: number
  /** The parent item's seq when nested under a dropdown parent, else NULL */
  parent_seq: number | null
  setting_name: string
  setting_value: string | null
  locale: string
}

export interface StaticPageRow {
  static_page_id: number
  path: string
  setting_name: string
  setting_value: string | null
  locale: string
}

export interface StandaloneNavRow {
  navigation_menu_item_id: number
  /** NULL for built-in items such as NMI_TYPE_PRIVACY */
  path: string | null
  type: string
  /** NULL when the item has no settings rows (LEFT JOIN) */
  setting_name: string | null
  setting_value: string | null
  locale: string
}

/** Raw OJS rows consumed by `buildPolicyTabs`. */
export interface PolicySourceRows {
  primaryLocale: string
  menuRows: MenuRow[]
  standaloneNavRows: StandaloneNavRow[]
  policySettingRows: SettingRow[]
  staticPageRows: StaticPageRow[]
}

// ── Known policies ──────────────────────────────────────────────────────────
//
// Policies with a canonical slug + title. Each entry lists the aliases
// (normalized) that may appear in OJS as a title, slug, path, or
// journal_settings key, so differently-worded OJS pages still land on the
// canonical tab (and its stable deep link). This is NOT an exclusive filter:
// any other OJS page whose title/path mentions "policy" is emitted as a
// dynamic tab (see `classifyCandidate`).

interface ApprovedPolicy {
  /** Canonical tab title shown to end-users */
  title: string
  /** Canonical slug used for tab identity */
  slug: string
  /** Aliases matched against normalized title/slug/path (OJS side) */
  aliases: string[]
  /** journal_settings keys whose value is the policy HTML */
  settingNames: string[]
  /**
   * OJS built-in navigation_menu_item types that identify this policy. These
   * point content at journal_settings rather than carrying their own HTML.
   */
  builtinTypes: string[]
}

const APPROVED_POLICIES: ApprovedPolicy[] = [
  {
    title: "Privacy Statement",
    slug: "privacy-statement",
    aliases: [
      "privacy statement",
      "privacy",
      "privacy policy",
    ],
    settingNames: ["privacyStatement"],
    builtinTypes: ["NMI_TYPE_PRIVACY"],
  },
  {
    title: "Policies on Ethics",
    slug: "policies-on-ethics",
    aliases: [
      "policies on ethics",
      "ethics",
      "ethics policy",
      "ethical policy",
      "publication ethics",
      "ethical guidelines",
      "ethics and malpractice",
      "publication ethics and malpractice",
    ],
    settingNames: [],
    builtinTypes: [],
  },
  {
    title: "Copyright & Licensing Policies",
    slug: "copyright-licensing",
    aliases: [
      "copyright and licensing policies",
      "copyright licensing policies",
      "copyright and licensing",
      "copyright licensing",
      "copyright",
      "copyright notice",
      "copyright policy",
      "licensing",
      "licensing policy",
      "license",
    ],
    settingNames: ["copyrightNotice"],
    builtinTypes: [],
  },
  {
    title: "Editorial Workflow",
    slug: "editorial-workflow",
    aliases: [
      "editorial workflow",
      "workflow",
      "editorial process",
      "review policy",
      "peer review",
      "peer review policy",
      "peer review process",
      "editorial policy",
    ],
    settingNames: ["reviewPolicy"],
    builtinTypes: [],
  },
  {
    title: "Indexing & Archiving",
    slug: "indexing-archiving",
    aliases: [
      "indexing and archiving",
      "indexing archiving",
      "indexing",
      "archiving",
      "archive policy",
      "archiving policy",
      "self archiving policy",
      "self archiving",
      "author self archive policy",
      "author self archiving policy",
    ],
    settingNames: ["authorSelfArchivePolicy"],
    builtinTypes: [],
  },
  {
    title: "DOIs & ORCID",
    slug: "dois-orcid",
    aliases: [
      "dois and orcid",
      "doi and orcid",
      "dois orcid",
      "doi orcid",
      "digital object identifier and orcid",
      "orcid",
      "dois",
      "doi",
      "digital object identifier",
    ],
    settingNames: [],
    builtinTypes: [],
  },
]

// ── Sanity check ────────────────────────────────────────────────────────────
//
// The slug + title pairs in APPROVED_POLICIES MUST exactly match
// POLICY_METADATA (the client-safe source of truth). This block runs at
// module-load and throws if drift is ever introduced — far better than
// silent SEO/URL mismatches at runtime.

if (process.env.NODE_ENV !== "production") {
  const expectedSlugs = POLICY_METADATA.map((p) => p.slug).join(",")
  const actualSlugs = APPROVED_POLICIES.map((p) => p.slug).join(",")
  if (expectedSlugs !== actualSlugs) {
    throw new Error(
      `[journal-policies-service] APPROVED_POLICIES slugs (${actualSlugs}) do not match POLICY_METADATA (${expectedSlugs}). Keep these in sync.`,
    )
  }
  for (const meta of POLICY_METADATA) {
    const found = APPROVED_POLICIES.find((p) => p.slug === meta.slug)
    if (!found || found.title !== meta.title) {
      throw new Error(
        `[journal-policies-service] Title mismatch for slug "${meta.slug}": APPROVED_POLICIES has "${found?.title}", POLICY_METADATA has "${meta.title}".`,
      )
    }
  }
}

// ── Normalization & matching ────────────────────────────────────────────────

/**
 * Canonical form for matching. Case-insensitive; `&` is treated as `and`;
 * any non-alphanumeric run collapses to a single space; leading/trailing
 * whitespace is stripped.
 *
 * Examples that resolve to "dois and orcid":
 *   "DOIs & ORCID"
 *   "dois-orcid"
 *   "DOIs and ORCID"
 */
export function normalizePolicyKey(value: string | null | undefined): string {
  if (!value) return ""
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Return the approved policy that matches any of the provided candidate
 * strings (title / slug / path / setting name), or `null` if none match.
 */
export function matchApprovedPolicy(
  candidates: ReadonlyArray<string | null | undefined>,
): ApprovedPolicy | null {
  const normalizedCandidates = candidates
    .map(normalizePolicyKey)
    .filter((v) => v.length > 0)

  if (normalizedCandidates.length === 0) return null

  for (const policy of APPROVED_POLICIES) {
    const aliasSet = new Set(policy.aliases.map(normalizePolicyKey))
    // Also treat the canonical title/slug as aliases
    aliasSet.add(normalizePolicyKey(policy.title))
    aliasSet.add(normalizePolicyKey(policy.slug))
    for (const settingName of policy.settingNames) {
      aliasSet.add(normalizePolicyKey(settingName))
    }
    for (const cand of normalizedCandidates) {
      if (aliasSet.has(cand)) return policy
    }
  }
  return null
}

// ── Sanitization config ─────────────────────────────────────────────────────

const POLICY_SANITIZE_OPTIONS = {
  allowedTags: [
    "p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "a",
    "h1", "h2", "h3", "h4", "h5", "blockquote", "span", "div",
    "table", "tbody", "tr", "td", "th", "thead", "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    "*": ["class", "style"],
  },
}

function sanitizePolicy(raw: string | null): string {
  if (!raw) return ""
  return rewriteOjsInlineImages(sanitizeHtml(raw, POLICY_SANITIZE_OPTIONS))
}

// ── Locale resolution ───────────────────────────────────────────────────────

/**
 * Priority: primaryLocale → '' (unlocalized) → any available locale.
 */
function pickBestLocale(
  rows: { setting_name: string; setting_value: string | null; locale: string }[],
  settingName: string,
  primaryLocale: string,
): string | null {
  const matching = rows.filter((r) => r.setting_name === settingName)
  if (matching.length === 0) return null

  const localeMatch = matching.find((r) => r.locale === primaryLocale)
  if (localeMatch !== undefined) return localeMatch.setting_value

  const unlocalized = matching.find((r) => r.locale === "")
  if (unlocalized !== undefined) return unlocalized.setting_value

  return matching[0]?.setting_value ?? null
}

// ── Candidate collection ────────────────────────────────────────────────────
//
// A candidate is a piece of content + identifying keys (title, path, type,
// settingName) + its position in OJS. Candidates are classified into tab
// slots (known or dynamic policy); non-policies are discarded. When several
// candidates land in the same slot, the lowest `priority` supplies the
// content and the earliest `position` places the tab.

const MENU_RANK = 0
const NAV_ITEM_RANK = 1
const STATIC_PAGE_RANK = 2
const SETTINGS_RANK = 3

/**
 * Sibling slots per menu parent. Nested items sort right after their parent:
 * parentSeq * MENU_CHILD_SLOTS + seq + 1.
 */
const MENU_CHILD_SLOTS = 1000

/** A candidate's place in OJS order — compared by rank, then id. */
interface OjsPosition {
  /**
   * Editor-arranged "Journal Policies" menu first (its drag-and-drop order),
   * then other nav items, then static pages, then journal_settings-only
   * policies — the last three in OJS creation order.
   */
  sourceRank: typeof MENU_RANK | typeof NAV_ITEM_RANK | typeof STATIC_PAGE_RANK | typeof SETTINGS_RANK
  /** menu order key / navigation_menu_item_id / static_page_id / known-policy index */
  id: number
}

function comparePositions(a: OjsPosition, b: OjsPosition): number {
  return a.sourceRank - b.sourceRank || a.id - b.id
}

interface PolicyCandidate {
  titleHint: string | null
  path: string | null
  type: string | null
  settingName: string | null
  content: string
  /** Lower = higher priority when multiple candidates match same policy */
  priority: number
  position: OjsPosition
  /**
   * Identity of the OJS page behind the candidate, so the same page reached
   * twice (menu + standalone, or nav item + static page on one path) is not
   * mistaken for two pages. Null for journal_settings fallbacks.
   */
  pageKey: string | null
}

/** Titles of parent items that group policies rather than being one. */
const POLICY_CONTAINER_KEYS = new Set(["policy", "policies", "journal policies", "journal policy"])

/** An OJS entity (nav item / static page) with its localized settings rows. */
interface WithSettings {
  settings: SettingRow[]
}

interface NavItem extends WithSettings {
  id: number
  path: string | null
  type: string
}

interface StaticPage extends WithSettings {
  id: number
  path: string
}

/** Collapse LEFT-JOINed entity + settings rows into one record per entity. */
function groupWithSettings<
  R extends { setting_name: string | null; setting_value: string | null; locale: string },
  G extends WithSettings,
>(rows: readonly R[], keyOf: (row: R) => number, create: (row: R) => G): G[] {
  const groups = new Map<number, G>()
  for (const row of rows) {
    let group = groups.get(keyOf(row))
    if (!group) {
      group = create(row)
      groups.set(keyOf(row), group)
    }
    if (row.setting_name) {
      group.settings.push({
        setting_name: row.setting_name,
        setting_value: row.setting_value,
        locale: row.locale,
      })
    }
  }
  return Array.from(groups.values())
}

function groupNavItems(rows: readonly StandaloneNavRow[]): NavItem[] {
  return groupWithSettings(
    rows,
    (row) => row.navigation_menu_item_id,
    (row) => ({ id: row.navigation_menu_item_id, path: row.path || null, type: row.type || "", settings: [] }),
  )
}

/** Known policy behind an OJS built-in nav item type (e.g. NMI_TYPE_PRIVACY). */
function findPolicyByBuiltinType(type: string | null): ApprovedPolicy | undefined {
  if (!type) return undefined
  return APPROVED_POLICIES.find((p) => p.builtinTypes.includes(type))
}

/**
 * Resolve a nav item's HTML: its own content, else the journal_settings
 * field behind a built-in type, else a static page sharing its path.
 */
function resolveNavItemContent(item: NavItem, rows: PolicySourceRows): string | null {
  let content = pickBestLocale(item.settings, "content", rows.primaryLocale)

  if (!content) {
    for (const settingName of findPolicyByBuiltinType(item.type)?.settingNames ?? []) {
      content = pickBestLocale(rows.policySettingRows, settingName, rows.primaryLocale)
      if (content) break
    }
  }

  if (!content && item.path) {
    const matching = rows.staticPageRows.filter((r) => r.path === item.path)
    if (matching.length > 0) {
      content = pickBestLocale(matching, "content", rows.primaryLocale)
    }
  }

  return content
}

function collectCandidates(rows: PolicySourceRows): PolicyCandidate[] {
  const candidates: PolicyCandidate[] = []

  const pushNavItems = (items: NavItem[], priority: number, positionOf: (item: NavItem) => OjsPosition) => {
    for (const item of items) {
      const sanitized = sanitizePolicy(resolveNavItemContent(item, rows))
      if (!sanitized.trim()) continue
      candidates.push({
        titleHint: pickBestLocale(item.settings, "title", rows.primaryLocale),
        path: item.path,
        type: item.type || null,
        settingName: null,
        content: sanitized,
        priority,
        position: positionOf(item),
        pageKey: item.path ? `path:${item.path}` : `nav:${item.id}`,
      })
    }
  }

  // SOURCE 1 — "Journal Policies" navigation menu (highest priority). Its
  // assignment order is the editor-controlled tab order.
  const menuOrder = new Map<number, number>()
  for (const row of rows.menuRows) {
    menuOrder.set(
      row.navigation_menu_item_id,
      row.parent_seq === null
        ? row.seq * MENU_CHILD_SLOTS
        : row.parent_seq * MENU_CHILD_SLOTS + row.seq + 1,
    )
  }
  pushNavItems(
    groupNavItems(
      rows.menuRows.map((row) => ({
        navigation_menu_item_id: row.navigation_menu_item_id,
        path: row.slug,
        type: row.type,
        setting_name: row.setting_name,
        setting_value: row.setting_value,
        locale: row.locale,
      })),
    ),
    1,
    (item) => ({ sourceRank: MENU_RANK, id: menuOrder.get(item.id) ?? 0 }),
  )

  // SOURCE 2 — Standalone navigation_menu_items (custom pages + built-ins)
  pushNavItems(groupNavItems(rows.standaloneNavRows), 2, (item) => ({ sourceRank: NAV_ITEM_RANK, id: item.id }))

  // SOURCE 3 — journal_settings keys directly
  APPROVED_POLICIES.forEach((policy, index) => {
    for (const settingName of policy.settingNames) {
      const sanitized = sanitizePolicy(pickBestLocale(rows.policySettingRows, settingName, rows.primaryLocale))
      if (!sanitized.trim()) continue
      candidates.push({
        titleHint: null,
        path: null,
        type: null,
        settingName,
        content: sanitized,
        priority: 3,
        position: { sourceRank: SETTINGS_RANK, id: index },
        pageKey: null,
      })
    }
  })

  // SOURCE 4 — static_pages
  const staticPages = groupWithSettings<StaticPageRow, StaticPage>(
    rows.staticPageRows,
    (row) => row.static_page_id,
    (row) => ({ id: row.static_page_id, path: row.path, settings: [] }),
  )
  for (const page of staticPages) {
    const sanitized = sanitizePolicy(pickBestLocale(page.settings, "content", rows.primaryLocale))
    if (!sanitized.trim()) continue
    candidates.push({
      titleHint: pickBestLocale(page.settings, "title", rows.primaryLocale),
      path: page.path || null,
      type: null,
      settingName: null,
      content: sanitized,
      priority: 4,
      position: { sourceRank: STATIC_PAGE_RANK, id: page.id },
      pageKey: page.path ? `path:${page.path}` : `static:${page.id}`,
    })
  }

  return candidates
}

// ── Classification ──────────────────────────────────────────────────────────

interface PolicySlot {
  slug: string
  title: string
  /** Tie-break when two slots share a position */
  knownIndex: number
}

/** Kebab-case an OJS path or title into a policy slug ("" when nothing usable remains). */
export function slugifyPolicyPath(value: string | null | undefined): string {
  if (!value) return ""
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_POLICY_SLUG_LENGTH)
    .replace(/-+$/, "")
}

function mentionsPolicy(value: string | null): boolean {
  const key = normalizePolicyKey(value)
  if (!key || POLICY_CONTAINER_KEYS.has(key)) return false
  return key.split(" ").some((token) => token === "policy" || token === "policies")
}

/**
 * A container groups policies ("Journal Policies"). Judged by title so a real
 * policy that merely lives at path `policies` is kept; untitled items fall
 * back to their path.
 */
function isPolicyContainer(candidate: PolicyCandidate): boolean {
  const title = normalizePolicyKey(candidate.titleHint)
  return POLICY_CONTAINER_KEYS.has(title || normalizePolicyKey(candidate.path))
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function classifyCandidate(candidate: PolicyCandidate): PolicySlot | null {
  if (isPolicyContainer(candidate)) return null

  const known =
    findPolicyByBuiltinType(candidate.type) ??
    matchApprovedPolicy([candidate.titleHint, candidate.path, candidate.settingName])
  if (known) {
    return { slug: known.slug, title: known.title, knownIndex: APPROVED_POLICIES.indexOf(known) }
  }

  if (!mentionsPolicy(candidate.titleHint) && !mentionsPolicy(candidate.path)) return null

  const slug = slugifyPolicyPath(candidate.path) || slugifyPolicyPath(candidate.titleHint)
  if (!slug) return null

  return {
    slug,
    title: candidate.titleHint?.trim() || humanizeSlug(slug),
    knownIndex: APPROVED_POLICIES.length,
  }
}

/**
 * Turn raw OJS rows into ordered policy tabs. Pure apart from a warning when
 * distinct OJS pages fold into one tab — so the classification and ordering
 * rules are unit-testable without I/O.
 */
export function buildPolicyTabs(rows: PolicySourceRows): PolicyTab[] {
  const slots = new Map<
    string,
    { slot: PolicySlot; content: string; priority: number; position: OjsPosition; pages: Set<string> }
  >()

  for (const candidate of collectCandidates(rows)) {
    const slot = classifyCandidate(candidate)
    if (!slot) continue

    const { pageKey } = candidate
    const existing = slots.get(slot.slug)
    if (!existing) {
      slots.set(slot.slug, {
        slot,
        content: candidate.content,
        priority: candidate.priority,
        position: candidate.position,
        pages: new Set(pageKey ? [pageKey] : []),
      })
      continue
    }
    if (pageKey) existing.pages.add(pageKey)
    if (candidate.priority < existing.priority) {
      existing.content = candidate.content
      existing.priority = candidate.priority
    }
    if (comparePositions(candidate.position, existing.position) < 0) {
      existing.position = candidate.position
    }
  }

  for (const { slot, pages } of slots.values()) {
    if (pages.size > 1) {
      console.warn(
        `[JournalPolicies] ${pages.size} OJS pages map to "${slot.title}" (${Array.from(pages).join(", ")}); only the highest-priority one is shown.`,
      )
    }
  }

  return Array.from(slots.values())
    .sort((a, b) => comparePositions(a.position, b.position) || a.slot.knownIndex - b.slot.knownIndex)
    .map(({ slot, content }) => ({ title: slot.title, slug: slot.slug, content }))
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function fetchJournalPolicies(ojsJournalId: string): Promise<JournalPolicies> {
  const empty: JournalPolicies = {
    tabs: [],
    doiEnabled: false,
    requireAuthorCompetingInterestsEnabled: false,
  }

  if (!/^\d+$/.test(ojsJournalId)) return empty

  const journalId = parseInt(ojsJournalId, 10)

  const primaryLocale = await getJournalPrimaryLocale(ojsJournalId)

  // ── Parallel data fetches from all OJS sources ──────────────────────────

  // Pre-compute the union of all setting names referenced by approved policies
  const allPolicySettingNames = Array.from(
    new Set(APPROVED_POLICIES.flatMap((p) => p.settingNames)),
  )
  const policyPlaceholders = allPolicySettingNames.map(() => "?").join(", ")

  const builtinTypes = Array.from(new Set(APPROVED_POLICIES.flatMap((p) => p.builtinTypes)))
  const builtinTypeClause =
    builtinTypes.length > 0 ? ` OR nmi.type IN (${builtinTypes.map(() => "?").join(", ")})` : ""

  const [configRows, menuRows, policySettingRows, staticPageRows, standaloneNavRows] = await Promise.all([
    // 1. DOI / Competing-Interests toggles
    ojsQuery<SettingRow>(
      `SELECT setting_name, setting_value, locale
       FROM journal_settings
       WHERE journal_id = ?
         AND setting_name IN ('enableDois', 'requireAuthorCompetingInterests')
         AND (locale = ? OR locale = '')`,
      [journalId, primaryLocale],
    ).catch((err): SettingRow[] => {
      console.error(`[JournalPolicies] Failed to load DOI/competing-interests config for journal_id=${journalId}:`, err)
      return []
    }),

    // 2. Navigation menu items from the "Journal Policies" custom menu
    ojsQuery<MenuRow>(
      `SELECT
          nmi.navigation_menu_item_id,
          nmi.path  AS slug,
          nmi.type,
          nmia.seq,
          parent.seq AS parent_seq,
          nmis.setting_name,
          nmis.setting_value,
          nmis.locale
       FROM navigation_menus nm
       JOIN navigation_menu_item_assignments nmia
         ON nm.navigation_menu_id = nmia.navigation_menu_id
       LEFT JOIN navigation_menu_item_assignments parent
         ON parent.navigation_menu_id = nmia.navigation_menu_id
        AND parent.navigation_menu_item_id = nmia.parent_id
       JOIN navigation_menu_items nmi
         ON nmia.navigation_menu_item_id = nmi.navigation_menu_item_id
       LEFT JOIN navigation_menu_item_settings nmis
         ON nmi.navigation_menu_item_id = nmis.navigation_menu_item_id
       WHERE nm.title = 'Journal Policies'
         AND nm.context_id = ?
       ORDER BY nmia.seq ASC`,
      [journalId],
    ).catch((err): MenuRow[] => {
      console.error(`[JournalPolicies] Failed to load "Journal Policies" navigation menu for journal_id=${journalId}:`, err)
      return []
    }),

    // 3. Standard policy fields from journal_settings (content source + fallback)
    allPolicySettingNames.length > 0
      ? ojsQuery<SettingRow>(
          `SELECT setting_name, setting_value, locale
           FROM journal_settings
           WHERE journal_id = ?
             AND setting_name IN (${policyPlaceholders})
             AND (locale = ? OR locale = '')`,
          [journalId, ...allPolicySettingNames, primaryLocale],
        ).catch((err): SettingRow[] => {
          console.error(`[JournalPolicies] Failed to load standard policy settings for journal_id=${journalId}:`, err)
          return []
        })
      : Promise.resolve<SettingRow[]>([]),

    // 4. Static pages (plugin-managed content — table may not exist)
    ojsQuery<StaticPageRow>(
      `SELECT
          sp.static_page_id,
          sp.path,
          sps.setting_name,
          sps.setting_value,
          sps.locale
       FROM static_pages sp
       LEFT JOIN static_page_settings sps
         ON sp.static_page_id = sps.static_page_id
       WHERE sp.context_id = ?`,
      [journalId],
    ).catch((err): StaticPageRow[] => {
      console.error(`[JournalPolicies] Failed to load static pages for journal_id=${journalId}:`, err)
      return []
    }),

    // 5. Standalone navigation_menu_items for this journal: custom pages
    //    (have a path) plus built-in policy items such as NMI_TYPE_PRIVACY
    //    (no path) so they take their place in OJS creation order.
    ojsQuery<StandaloneNavRow>(
      `SELECT
          nmi.navigation_menu_item_id,
          nmi.path,
          nmi.type,
          nmis.setting_name,
          nmis.setting_value,
          nmis.locale
       FROM navigation_menu_items nmi
       LEFT JOIN navigation_menu_item_settings nmis
         ON nmi.navigation_menu_item_id = nmis.navigation_menu_item_id
       WHERE nmi.context_id = ?
         AND ((nmi.path IS NOT NULL AND nmi.path != '')${builtinTypeClause})`,
      [journalId, ...builtinTypes],
    ).catch((err): StandaloneNavRow[] => {
      console.error(`[JournalPolicies] Failed to load standalone nav items for journal_id=${journalId}:`, err)
      return []
    }),
  ])

  const tabs = buildPolicyTabs({
    primaryLocale,
    menuRows,
    standaloneNavRows,
    policySettingRows,
    staticPageRows,
  })

  // Missing known policies are hidden; log so operators can see which
  // policies are unconfigured on the OJS side.
  for (const policy of APPROVED_POLICIES) {
    if (!tabs.some((t) => t.slug === policy.slug)) {
      console.warn(
        `[JournalPolicies] No OJS content found for approved policy "${policy.title}" (journal_id=${journalId}).`,
      )
    }
  }

  const doiRaw = pickBestLocale(configRows, "enableDois", primaryLocale)
  const competingInterestsRaw = pickBestLocale(configRows, "requireAuthorCompetingInterests", primaryLocale)

  return {
    tabs,
    doiEnabled: doiRaw === "1" || doiRaw === "true",
    requireAuthorCompetingInterestsEnabled: competingInterestsRaw === "1" || competingInterestsRaw === "true",
  }
}
