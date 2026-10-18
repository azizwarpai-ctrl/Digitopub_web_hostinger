/**
 * Journal detail tab configuration & route resolution — client- and
 * server-safe.
 *
 * Maps the five journal-detail tabs to their URL path segments and resolves
 * catch-all route segments back into a tab selection:
 *   - the route (`[id]/[...tab]/page.tsx`, server) calls `resolveTabSegments`
 *   - the view (`journal-detail-view.tsx`, client) calls `journalTabPath`
 *
 * Two tabs support nested sub-slugs:
 *   - `policies` → `policies/{policySlug}`
 *   - `about-journal` → `about-journal/{aboutSlug}`
 *
 * Keeping both directions here makes this the single source of truth for
 * journal tab routing, and keeps the logic unit-testable in isolation.
 */

import { isPolicySlugShape } from "@/src/features/journals/policy-slugs"
import { isValidAboutSlug } from "@/src/features/journals/about-slugs"

export type JournalDetailTab = "about" | "author" | "current" | "archive" | "policies"

/**
 * URL path segment for each tab. About is the journal landing page itself
 * (`/journals/{id}`), so it has no segment. The `about-journal` segment is
 * handled as a nestable alias in `SEGMENT_TO_TAB` (maps to the `about` tab).
 */
export const TAB_SEGMENTS: Record<JournalDetailTab, string> = {
  about: "",
  author: "author-guidelines",
  current: "current-issue",
  archive: "archive",
  policies: "policies",
}

/**
 * Reverse lookup: URL path segment → tab key.
 *
 * `about-journal` maps to the `about` tab (so the catch-all resolves it),
 * while the bare `/journals/{id}` route (no segment) still renders About via
 * the index page.tsx.
 */
export const SEGMENT_TO_TAB: Record<string, JournalDetailTab> = {
  "about-journal": "about",
  "author-guidelines": "author",
  "current-issue": "current",
  archive: "archive",
  policies: "policies",
}

/** Human-readable section name, used in `<title>` metadata. */
export const TAB_TITLES: Record<JournalDetailTab, string> = {
  about: "About",
  author: "Author Guidelines",
  current: "Current Issue",
  archive: "Archive",
  policies: "Journal Policies",
}

/** Build the path for a journal tab. About resolves to the journal root. */
export function journalTabPath(id: string, tab: JournalDetailTab): string {
  const segment = TAB_SEGMENTS[tab]
  return segment ? `/journals/${id}/${segment}` : `/journals/${id}`
}

export interface ResolvedTab {
  tab: JournalDetailTab
  /** Set only for `tab === "policies"` when a specific policy is requested. */
  policySlug: string | null
  /** Set only for `tab === "about"` when a specific about-journal section is requested. */
  aboutSlug: string | null
}

/**
 * Resolve the `[...tab]` catch-all segments into a tab key + optional
 * policy/about slug. Returns `null` when the URL does not map to a valid tab —
 * the route then renders a 404.
 *
 *   ["author-guidelines"]              → { tab: "author",    policySlug: null,                aboutSlug: null }
 *   ["policies"]                       → { tab: "policies",  policySlug: null,                aboutSlug: null }
 *   ["policies", "privacy-statement"]  → { tab: "policies",  policySlug: "privacy-statement", aboutSlug: null }
 *   ["policies", "Bad Slug"]           → null  (malformed policy slug)
 *   ["about-journal"]                  → { tab: "about",     policySlug: null,                aboutSlug: null }
 *   ["about-journal", "aims-scope"]    → { tab: "about",     policySlug: null,                aboutSlug: "aims-scope" }
 *   ["about-journal", "bogus"]         → null  (unknown about slug)
 *   ["archive", "extra"]               → null  (non-nestable tab can't have sub-segments)
 *   ["bogus-tab"]                      → null  (unknown segment)
 *   ["policies", "x", "y"]             → null  (too deep)
 */
export function resolveTabSegments(segments: string[]): ResolvedTab | null {
  const [mainSegment, subSegment, ...rest] = segments
  if (rest.length > 0) return null

  const tab = SEGMENT_TO_TAB[mainSegment]
  if (!tab) return null

  if (tab === "policies") {
    if (subSegment === undefined) return { tab, policySlug: null, aboutSlug: null }
    // Policies are discovered dynamically from OJS, so only the shape is
    // checked here; the page 404s when the slug is not among the fetched tabs.
    if (!isPolicySlugShape(subSegment)) return null
    return { tab, policySlug: subSegment, aboutSlug: null }
  }

  // about-journal can nest an about sub-slug (aims-scope, editorial-board, etc.).
  if (mainSegment === "about-journal") {
    if (subSegment === undefined) return { tab, policySlug: null, aboutSlug: null }
    if (!isValidAboutSlug(subSegment)) return null
    return { tab, policySlug: null, aboutSlug: subSegment }
  }

  // All other tabs never carry a sub-segment.
  if (subSegment !== undefined) return null
  return { tab, policySlug: null, aboutSlug: null }
}
