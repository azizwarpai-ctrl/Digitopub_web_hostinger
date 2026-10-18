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
import { POLICY_METADATA, slugifyPolicyPath } from "@/src/features/journals/policy-slugs"

export {
  APPROVED_POLICY_SLUGS,
  isValidPolicySlug,
  isPolicySlugShape,
  slugifyPolicyPath,
  resolvePolicyRoute,
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

// ── Internal row types ──────────────────────────────────────────────────────

export interface SettingRow {
  setting_name: string
  setting_value: string | null
  locale: string
}

export interface MenuRow {
  navigation_menu_item_id: number
  slug: string
  type: string
  seq: number
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

// ── Approved policy whitelist ───────────────────────────────────────────────
//
// The ONLY tabs that may appear in the Policies section. Each entry lists the
// aliases (normalized) that may appear in OJS as a title, slug, path, or
// journal_settings key. Matching is deliberately permissive so different OJS
// deployments can use their own wording, but nothing outside this list is
// ever emitted.

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
// A candidate is a piece of content + identifying keys (title, slug, path,
// type, settingName) + an OJS creation-order key. Candidates are classified
// into tab slots (known or dynamic policy); non-policies are discarded. When
// several candidates land in the same slot, the lowest `priority` supplies
// the content and the lowest `order` positions the tab.

interface PolicyCandidate {
  titleHint: string | null
  slug: string | null
  path: string | null
  type: string | null
  settingName: string | null
  content: string
  /** Lower = higher priority when multiple candidates match same policy */
  priority: number
  /** OJS creation-order key — lower sorts first */
  order: number
}

/** Static pages sort after every nav item. */
const STATIC_PAGE_ORDER_BASE = 1_000_000_000
/** journal_settings-only policies sort last, in known-policy order. */
const SETTINGS_ORDER_BASE = 2_000_000_000

/** Parent/container items that group policies rather than being one. */
const POLICY_CONTAINER_KEYS = new Set(["policy", "policies", "journal policies", "journal policy"])

type LocalizedSetting = { setting_name: string; setting_value: string | null; locale: string }

interface NavItem {
  id: number
  path: string | null
  type: string
  settings: LocalizedSetting[]
}

function groupNavItems(
  rows: ReadonlyArray<{
    navigation_menu_item_id: number
    path: string | null
    type: string
    setting_name: string | null
    setting_value: string | null
    locale: string
  }>,
): NavItem[] {
  const items = new Map<number, NavItem>()
  for (const row of rows) {
    let item = items.get(row.navigation_menu_item_id)
    if (!item) {
      item = { id: row.navigation_menu_item_id, path: row.path || null, type: row.type || "", settings: [] }
      items.set(row.navigation_menu_item_id, item)
    }
    if (row.setting_name) {
      item.settings.push({
        setting_name: row.setting_name,
        setting_value: row.setting_value,
        locale: row.locale,
      })
    }
  }
  return Array.from(items.values())
}

/**
 * Resolve a nav item's HTML: its own content, else the journal_settings
 * field behind a built-in type (e.g. NMI_TYPE_PRIVACY), else a static page
 * sharing its path.
 */
function resolveNavItemContent(item: NavItem, rows: PolicySourceRows): string | null {
  let content = pickBestLocale(item.settings, "content", rows.primaryLocale)

  if (!content) {
    const policyByType = APPROVED_POLICIES.find((p) => p.builtinTypes.includes(item.type))
    if (policyByType) {
      for (const settingName of policyByType.settingNames) {
        content = pickBestLocale(rows.policySettingRows, settingName, rows.primaryLocale)
        if (content) break
      }
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

  const pushNavItems = (items: NavItem[], priority: number, pathAsSlug: boolean) => {
    for (const item of items) {
      const sanitized = sanitizePolicy(resolveNavItemContent(item, rows))
      if (!sanitized.trim()) continue
      candidates.push({
        titleHint: pickBestLocale(item.settings, "title", rows.primaryLocale),
        slug: pathAsSlug ? item.path : null,
        path: pathAsSlug ? null : item.path,
        type: item.type || null,
        settingName: null,
        content: sanitized,
        priority,
        order: item.id,
      })
    }
  }

  // SOURCE 1 — "Journal Policies" navigation menu (highest priority)
  pushNavItems(groupNavItems(rows.menuRows.map((r) => ({ ...r, path: r.slug }))), 1, true)

  // SOURCE 2 — Standalone navigation_menu_items (custom pages + built-ins)
  pushNavItems(groupNavItems(rows.standaloneNavRows), 2, false)

  // SOURCE 3 — journal_settings keys directly
  APPROVED_POLICIES.forEach((policy, index) => {
    for (const settingName of policy.settingNames) {
      const sanitized = sanitizePolicy(pickBestLocale(rows.policySettingRows, settingName, rows.primaryLocale))
      if (!sanitized.trim()) continue
      candidates.push({
        titleHint: null,
        slug: null,
        path: null,
        type: null,
        settingName,
        content: sanitized,
        priority: 3,
        order: SETTINGS_ORDER_BASE + index,
      })
    }
  })

  // SOURCE 4 — static_pages
  const staticPages = new Map<number, { path: string; settings: LocalizedSetting[] }>()
  for (const row of rows.staticPageRows) {
    if (!staticPages.has(row.static_page_id)) {
      staticPages.set(row.static_page_id, { path: row.path, settings: [] })
    }
    if (row.setting_name) {
      staticPages.get(row.static_page_id)!.settings.push({
        setting_name: row.setting_name,
        setting_value: row.setting_value,
        locale: row.locale,
      })
    }
  }
  for (const [id, page] of staticPages) {
    const sanitized = sanitizePolicy(pickBestLocale(page.settings, "content", rows.primaryLocale))
    if (!sanitized.trim()) continue
    candidates.push({
      titleHint: pickBestLocale(page.settings, "title", rows.primaryLocale),
      slug: null,
      path: page.path || null,
      type: null,
      settingName: null,
      content: sanitized,
      priority: 4,
      order: STATIC_PAGE_ORDER_BASE + id,
    })
  }

  return candidates
}

// ── Classification ──────────────────────────────────────────────────────────

interface PolicySlot {
  slug: string
  title: string
  /** Tie-break when two slots share an order key */
  knownIndex: number
}

function mentionsPolicy(value: string | null): boolean {
  const key = normalizePolicyKey(value)
  if (!key || POLICY_CONTAINER_KEYS.has(key)) return false
  return key.split(" ").some((token) => token === "policy" || token === "policies")
}

function isPolicyContainer(candidate: PolicyCandidate): boolean {
  return [candidate.titleHint, candidate.slug, candidate.path].some((v) =>
    POLICY_CONTAINER_KEYS.has(normalizePolicyKey(v)),
  )
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function classifyCandidate(candidate: PolicyCandidate): PolicySlot | null {
  if (isPolicyContainer(candidate)) return null

  const byType = candidate.type
    ? APPROVED_POLICIES.find((p) => p.builtinTypes.includes(candidate.type!))
    : undefined
  const known =
    byType ??
    matchApprovedPolicy([candidate.titleHint, candidate.slug, candidate.path, candidate.settingName])
  if (known) {
    return { slug: known.slug, title: known.title, knownIndex: APPROVED_POLICIES.indexOf(known) }
  }

  const pathOrSlug = candidate.path ?? candidate.slug
  if (!mentionsPolicy(candidate.titleHint) && !mentionsPolicy(pathOrSlug)) return null

  const slug = slugifyPolicyPath(pathOrSlug) || slugifyPolicyPath(candidate.titleHint)
  if (!slug) return null

  return {
    slug,
    title: candidate.titleHint?.trim() || humanizeSlug(slug),
    knownIndex: APPROVED_POLICIES.length,
  }
}

/**
 * Turn raw OJS rows into ordered policy tabs. Pure — no I/O — so the
 * classification and ordering rules are unit-testable.
 */
export function buildPolicyTabs(rows: PolicySourceRows): PolicyTab[] {
  const slots = new Map<string, { slot: PolicySlot; content: string; priority: number; order: number }>()

  for (const candidate of collectCandidates(rows)) {
    const slot = classifyCandidate(candidate)
    if (!slot) continue

    const existing = slots.get(slot.slug)
    if (!existing) {
      slots.set(slot.slug, { slot, content: candidate.content, priority: candidate.priority, order: candidate.order })
      continue
    }
    if (candidate.priority < existing.priority) {
      existing.content = candidate.content
      existing.priority = candidate.priority
    }
    existing.order = Math.min(existing.order, candidate.order)
  }

  return Array.from(slots.values())
    .sort((a, b) => a.order - b.order || a.slot.knownIndex - b.slot.knownIndex)
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
          nmis.setting_name,
          nmis.setting_value,
          nmis.locale
       FROM navigation_menus nm
       JOIN navigation_menu_item_assignments nmia
         ON nm.navigation_menu_id = nmia.navigation_menu_id
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
