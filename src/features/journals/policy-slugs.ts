/**
 * Known policy tab metadata — client- and server-safe.
 *
 * These are the policies with canonical slugs/titles. Additional policies are
 * discovered dynamically from OJS (#182) and use a slug derived from their
 * OJS path — see `isPolicySlugShape` / `slugifyPolicyPath`.
 *
 * The full whitelist (with OJS aliases, journal_settings keys, built-in nav
 * menu types, etc.) lives in `server/journal-policies-service.ts`. This file
 * exports ONLY the URL-facing slug + title pairs so the client bundle never
 * has to pull in the OJS / mysql2 modules just to validate a URL segment.
 *
 * `journal-policies-service.ts` imports from THIS file to build its rich list
 * — making this the single source of truth for slug/title pairs.
 */

export interface PolicyMeta {
  readonly slug: string
  readonly title: string
}

export const POLICY_METADATA: readonly PolicyMeta[] = [
  { slug: "privacy-statement", title: "Privacy Statement" },
  { slug: "policies-on-ethics", title: "Policies on Ethics" },
  { slug: "copyright-licensing", title: "Copyright & Licensing Policies" },
  { slug: "editorial-workflow", title: "Editorial Workflow" },
  { slug: "indexing-archiving", title: "Indexing & Archiving" },
  { slug: "dois-orcid", title: "DOIs & ORCID" },
]

export const APPROVED_POLICY_SLUGS: readonly string[] = POLICY_METADATA.map(
  (p) => p.slug,
)

/** True when `slug` matches a canonical POLICY_METADATA.slug exactly. */
export function isValidPolicySlug(slug: string | null | undefined): boolean {
  if (!slug) return false
  return APPROVED_POLICY_SLUGS.includes(slug)
}

const POLICY_SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_POLICY_SLUG_LENGTH = 80

/**
 * True when `slug` is a well-formed policy URL segment (lowercase kebab-case,
 * ≤ 80 chars). Policies are discovered dynamically from OJS, so the route can
 * only validate the shape — whether the slug exists is decided against the
 * fetched tabs.
 */
export function isPolicySlugShape(slug: string | null | undefined): boolean {
  if (!slug || slug.length > MAX_POLICY_SLUG_LENGTH) return false
  return POLICY_SLUG_SHAPE.test(slug)
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

/**
 * Decide whether `/policies/{slug}` exists and what to title it, given the
 * tabs fetched from OJS (`null`/empty when OJS was unavailable).
 *
 * - Known slugs always resolve (canonical title) — matches prior behavior.
 * - Dynamic slugs take their title from the fetched tab.
 * - A 404 is only signalled when OJS actually returned tabs and the slug is
 *   not among them; an OJS outage never turns a valid link into a 404.
 */
export function resolvePolicyRoute(
  slug: string,
  tabs: ReadonlyArray<{ slug: string; title: string }> | null,
): { found: true; title: string | null } | { found: false } {
  const knownTitle = getPolicyTitleBySlug(slug)
  if (knownTitle) return { found: true, title: knownTitle }
  if (!tabs || tabs.length === 0) return { found: true, title: null }
  const tab = tabs.find((t) => t.slug === slug)
  return tab ? { found: true, title: tab.title } : { found: false }
}

/** Canonical human-readable title for a slug, or null if the slug is unknown. */
export function getPolicyTitleBySlug(slug: string): string | null {
  return POLICY_METADATA.find((p) => p.slug === slug)?.title ?? null
}
