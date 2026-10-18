/**
 * Policy tab URL metadata — client- and server-safe.
 *
 * Holds the KNOWN policies (canonical slug + title pairs) plus the URL-facing
 * helpers the route needs. Additional policies are discovered dynamically
 * from OJS (#182); their slugs are derived server-side from the OJS path
 * (`slugifyPolicyPath` in `server/journal-policies-service.ts`), so the route
 * can only check a slug's shape and must ask the fetched tabs whether it
 * exists (`resolvePolicyRoute`).
 *
 * The full known-policy table (OJS aliases, journal_settings keys, built-in
 * nav menu types, etc.) lives in `server/journal-policies-service.ts`. Nothing
 * here imports the OJS / mysql2 modules, so the client bundle stays clean.
 *
 * `journal-policies-service.ts` imports from THIS file to build its rich list
 * — making this the single source of truth for known slug/title pairs.
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
export const MAX_POLICY_SLUG_LENGTH = 80

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

export type PolicyRouteResolution = { found: true; title: string | null } | { found: false }

/**
 * Decide whether `/policies/{slug}` exists and what to title it.
 *
 * - Known slugs always resolve (canonical title) without calling `loadTabs`.
 * - Dynamic slugs take their title from the tabs `loadTabs` fetches from OJS.
 * - Not-found is only signalled when OJS actually returned tabs and the slug
 *   is not among them; an OJS outage (`null`/empty) never 404s a valid link.
 */
export async function resolvePolicyRoute(
  slug: string,
  loadTabs: () => Promise<ReadonlyArray<{ slug: string; title: string }> | null>,
): Promise<PolicyRouteResolution> {
  const knownTitle = getPolicyTitleBySlug(slug)
  if (knownTitle) return { found: true, title: knownTitle }
  const tabs = await loadTabs()
  if (!tabs || tabs.length === 0) return { found: true, title: null }
  const tab = tabs.find((t) => t.slug === slug)
  return tab ? { found: true, title: tab.title } : { found: false }
}

/** Canonical human-readable title for a slug, or null if the slug is unknown. */
export function getPolicyTitleBySlug(slug: string): string | null {
  return POLICY_METADATA.find((p) => p.slug === slug)?.title ?? null
}
