import { type NextRequest, NextResponse } from "next/server"
import { clientIpFromHeaders } from "@/src/lib/ip-hash"

import { getOjsHostnames } from "@/src/features/ojs/utils/ojs-config"
import { OJS_FETCH_HEADERS } from "@/src/features/ojs/utils/ojs-hosts"

/**
 * OJS image proxy — fetches public assets from the OJS server using a
 * browser-style User-Agent with no Referer header, bypassing the WAF / hotlink
 * protection that blocks direct cross-origin <img> requests from digitopub.com.
 *
 * Security constraints:
 *   - Only OJS-managed hostnames are proxied (re-validated on each redirect hop).
 *   - Only raster MIME types are returned (SVG is blocked to prevent stored XSS
 *     via inline scripts that would execute under digitopub.com's origin).
 *   - The response body is read chunk-by-chunk and aborted past MAX_BYTES so a
 *     malicious upstream cannot exhaust memory by lying in content-length.
 *
 * Usage: /api/image-proxy?url=https%3A%2F%2Fjournals.digitopub.com%2F...
 */

const ALLOWED_HOSTS = getOjsHostnames()

// SVG is intentionally excluded — it's an executable XML format that can carry
// <script> and run under the calling origin.
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif",
])

// OJS homepage/cover images are full-resolution and routinely run 3–4 MB.
// Override IMAGE_PROXY_MAX_BYTES in the environment if you need a tighter cap.
const MAX_BYTES = Number(process.env.IMAGE_PROXY_MAX_BYTES) || 15 * 1024 * 1024
const MAX_REDIRECTS = 3

// Global in-process concurrency cap. Prevents a burst of large images from
// exhausting the Node.js heap. Next.js may run multiple workers, so this is
// per-worker; total memory ceiling = MAX_BYTES × MAX_CONCURRENT × workers.
const MAX_CONCURRENT = Number(process.env.IMAGE_PROXY_MAX_CONCURRENT) || 20
let activeRequests = 0

// Per-IP sliding-window rate limiter (best-effort; state is per-worker-process).
// Stops a single crawler from monopolising the proxy.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = Number(process.env.IMAGE_PROXY_RATE_LIMIT) || 200
const ipCounters = new Map<string, { count: number; windowStart: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  if (ipCounters.size > 10_000) {
    for (const [key, entry] of ipCounters) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) ipCounters.delete(key)
    }
  }
  const entry = ipCounters.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipCounters.set(ip, { count: 1, windowStart: now })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT_MAX
}

// Browser-like UA ensures OJS nginx rules don't block the request as a bot
const FETCH_HEADERS = OJS_FETCH_HEADERS

function hostAllowed(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false
  return ALLOWED_HOSTS.has(url.hostname)
}

/**
 * Fetch the URL, following redirects manually so each hop's host is
 * re-validated against the allowlist. A `redirect: "follow"` fetch would let an
 * allowlisted host bounce us to an arbitrary external origin.
 */
async function fetchWithAllowlistedRedirects(initialUrl: string): Promise<Response> {
  let currentUrl = initialUrl
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const parsed = new URL(currentUrl)
    if (!hostAllowed(parsed)) {
      throw new Error(`redirect target not allowlisted: ${parsed.hostname}`)
    }
    const upstream = await fetch(currentUrl, {
      headers: FETCH_HEADERS,
      // Explicitly omit Referer so nginx hotlink rules don't trigger
      redirect: "manual",
    })
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location")
      if (!location) {
        throw new Error("redirect without Location header")
      }
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }
    return upstream
  }
  throw new Error("too many redirects")
}

export async function GET(request: NextRequest) {
  // Proxy-verified client IP (#194), not the spoofable first X-Forwarded-For entry.
  const clientIp = clientIpFromHeaders(request.headers)

  if (!checkRateLimit(clientIp)) {
    console.warn("[image-proxy] rate limit exceeded", { ip: clientIp, active: activeRequests })
    return new NextResponse("Rate limit exceeded", { status: 429 })
  }

  if (activeRequests >= MAX_CONCURRENT) {
    console.warn("[image-proxy] concurrency limit reached", {
      active: activeRequests,
      limit: MAX_CONCURRENT,
    })
    return new NextResponse("Too many concurrent requests", { status: 503 })
  }

  activeRequests++
  if (activeRequests > MAX_CONCURRENT * 0.8) {
    console.warn("[image-proxy] concurrency high", { active: activeRequests, limit: MAX_CONCURRENT })
  }

  try {
    const { searchParams } = new URL(request.url)
    const rawUrl = searchParams.get("url")

    if (!rawUrl) {
      return new NextResponse("Missing url parameter", { status: 400 })
    }

    let target: URL
    try {
      target = new URL(rawUrl)
    } catch {
      return new NextResponse("Invalid url", { status: 400 })
    }

    if (!hostAllowed(target)) {
      return new NextResponse("Host not allowed", { status: 403 })
    }

    let upstream: Response
    try {
      upstream = await fetchWithAllowlistedRedirects(rawUrl)
    } catch (err) {
      console.warn("[image-proxy] fetch failed", rawUrl, String(err))
      return new NextResponse("Upstream unreachable", { status: 502 })
    }

    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status })
    }

    const contentType = (upstream.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase()
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      return new NextResponse("Upstream did not return an allowed image type", { status: 502 })
    }

    // Trust content-length only as a fast-path rejection — a malicious upstream
    // can lie, so we still cap the streamed read below.
    // Use NaN when the header is absent so the isFinite guard doesn't mis-fire
    // on the Number(null) → 0 coercion.
    const rawLength = upstream.headers.get("content-length")
    const declaredLength = rawLength !== null ? Number(rawLength) : NaN
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      return new NextResponse("Image too large", { status: 502 })
    }

    if (!upstream.body) {
      return new NextResponse("Empty response body", { status: 502 })
    }

    // Read chunk-by-chunk, aborting early if the upstream exceeds MAX_BYTES.
    const reader = upstream.body.getReader()
    const chunks: Uint8Array[] = []
    let bytesRead = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        bytesRead += value.byteLength
        if (bytesRead > MAX_BYTES) {
          await reader.cancel()
          console.warn("[image-proxy] image exceeded MAX_BYTES", { url: rawUrl, bytes: bytesRead })
          return new NextResponse("Image too large", { status: 502 })
        }
        chunks.push(value)
      }
    } catch (err) {
      console.warn("[image-proxy] body read failed", rawUrl, String(err))
      return new NextResponse("Upstream read failed", { status: 502 })
    }

    const buffer = Buffer.concat(chunks, bytesRead)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cache aggressively — OJS images don't change often
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        Vary: "Accept",
      },
    })
  } finally {
    activeRequests--
  }
}
