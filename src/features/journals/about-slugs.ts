/**
 * Canonical About Journal sub-tab metadata — client- and server-safe.
 *
 * Mirrors the known slug/title list in `policy-slugs.ts`, but About sub-tabs
 * are a fixed set: this file exports ONLY the URL-facing slug + title pairs
 * so the client bundle never has to pull in OJS / mysql2 modules just to
 * validate a URL segment.
 *
 * `tab-config.ts` imports from THIS file to validate `about-journal` sub-slugs
 * — making this the single source of truth for slug/title pairs.
 */

export interface AboutMeta {
  readonly slug: string
  readonly title: string
}

export const ABOUT_METADATA: readonly AboutMeta[] = [
  { slug: "aims-scope", title: "Aims & Scope" },
  { slug: "editorial-board", title: "Editorial Board" },
  { slug: "advisory-board", title: "Advisory Board" },
  { slug: "journal-details", title: "Journal Details" },
]

export const APPROVED_ABOUT_SLUGS: readonly string[] = ABOUT_METADATA.map(
  (a) => a.slug,
)

/** True when `slug` matches a canonical ABOUT_METADATA.slug exactly. */
export function isValidAboutSlug(slug: string | null | undefined): boolean {
  if (!slug) return false
  return APPROVED_ABOUT_SLUGS.includes(slug)
}

/** Canonical human-readable title for a slug, or null if the slug is unknown. */
export function getAboutTitleBySlug(slug: string): string | null {
  return ABOUT_METADATA.find((a) => a.slug === slug)?.title ?? null
}
