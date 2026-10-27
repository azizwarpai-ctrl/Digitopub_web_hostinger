/**
 * Single source of truth for OJS host classifications.
 *
 * Defines canonical, alias, and dead hostnames used across both server-side
 * utilities (rewrite-inline-images, image-proxy route) and client-side
 * components (<OjsImage>).
 */

/**
 * End-state public base URL for the OJS install.
 */
export const DEFAULT_OJS_LANDING_BASE_URL = "https://journals.digitopub.com"

export const CANONICAL_OJS_HOST = new URL(DEFAULT_OJS_LANDING_BASE_URL).hostname

export const OJS_ALIAS_HOSTS = new Set<string>([
  "submitmanager.com",
  "www.submitmanager.com",
  "ij-mp.com",
  "www.ij-mp.com",
  "digitodontics.com",
  "www.digitodontics.com",
])

export const DEAD_EXTERNAL_HOSTS = new Set<string>([
  // journals.zu.edu.ly was removed 2026-09-05: the host is back up and serves
  // 200 image/png — dead-listing it was silently discarding real board photos.
  "jtr.cit.edu.ly",
])

/**
 * Returns all hostnames recognized as part of the OJS installation (canonical + aliases + env overrides).
 * Used by image proxy allowlists and host validation.
 */
export function getAllOjsHostnames(): Set<string> {
  const hosts = new Set<string>([CANONICAL_OJS_HOST])

  // Add alias hosts
  for (const alias of OJS_ALIAS_HOSTS) {
    hosts.add(alias)
  }

  // Add environment hostnames if present
  const tryAdd = (url: string | null | undefined) => {
    if (!url) return
    try {
      hosts.add(new URL(url).hostname)
    } catch {
      // ignore invalid URLs in env
    }
  }

  tryAdd(process.env.OJS_BASE_URL)
  tryAdd(process.env.PUBLIC_OJS_BASE_URL)
  tryAdd(process.env.NEXT_PUBLIC_OJS_BASE_URL)

  return hosts
}

/**
 * Check if a hostname belongs to an OJS host (canonical, alias, or env override).
 */
export function isOjsHost(hostname: string): boolean {
  if (!hostname) return false
  const lower = hostname.toLowerCase()
  if (lower === CANONICAL_OJS_HOST) return true
  if (OJS_ALIAS_HOSTS.has(lower)) return true

  const allHosts = getAllOjsHostnames()
  return allHosts.has(lower)
}

/**
 * Headers for server-side requests to OJS images. The OJS host's nginx rules
 * block bot-like requests, so these look like a browser (no Referer, which
 * would trip hotlink protection). Shared by /api/image-proxy and the sync's
 * cover check so both see what a visitor sees.
 */
export const OJS_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "image/webp,image/avif,image/png,image/jpeg,image/gif",
  "Accept-Language": "en-US,en;q=0.9",
} as const

/**
 * Redirect statuses that carry a `Location` header worth considering.
 */
export const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * Resolves a redirect `Location` against the current URL, but only returns a
 * target when it stays on an OJS-owned host over HTTPS. Anything else returns
 * null — callers must not follow, so credentials (e.g. the PDF bridge's
 * Bearer token) are never forwarded to a foreign host.
 */
export function resolveOjsRedirectTarget(
  location: string | null,
  currentUrl: URL
): URL | null {
  if (!location) return null
  let next: URL
  try {
    next = new URL(location, currentUrl)
  } catch {
    return null
  }
  if (next.protocol !== "https:") return null
  if (!isOjsHost(next.hostname)) return null
  return next
}
