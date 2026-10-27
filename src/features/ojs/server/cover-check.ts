import { isOjsHost, OJS_FETCH_HEADERS, REDIRECT_STATUSES, resolveOjsRedirectTarget } from "@/src/features/ojs/utils/ojs-hosts"

/**
 * Cover write guard for the OJS journal sync (#239).
 *
 * Journal covers broke in production three times because a parser bug made
 * the sync write URLs that 404 over working ones. Before the sync replaces a
 * stored cover URL, it checks that the new one loads; a definitively broken
 * new URL never replaces an old one that still loads.
 *
 * Only OJS-owned hosts are ever requested (no SSRF), redirects are followed
 * only within OJS hosts, and network trouble is "unknown", which never
 * blocks an update (a transient error must not freeze a cover forever).
 */

/** "missing" = no cover URL at all (a journal without a cover is not a failure). */
export type CoverProbe = "ok" | "broken" | "missing" | "unknown"

const MAX_REDIRECTS = 3

export async function probeCoverUrl(
    url: string | null,
    opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<CoverProbe> {
    if (!url) return "missing"
    let current: URL
    try {
        current = new URL(url)
    } catch {
        return "broken"
    }
    if (current.protocol !== "https:" && current.protocol !== "http:") return "broken"
    if (!isOjsHost(current.hostname)) return "unknown"

    const fetchImpl = opts.fetchImpl ?? fetch
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000)
        try {
            const res = await fetchImpl(current, { method: "HEAD", headers: OJS_FETCH_HEADERS, redirect: "manual", signal: controller.signal })
            if (REDIRECT_STATUSES.has(res.status)) {
                const next = resolveOjsRedirectTarget(res.headers.get("location"), current)
                if (!next) return "unknown"
                current = next
                continue
            }
            if (res.status === 404 || res.status === 410) return "broken"
            if (res.ok) {
                const type = res.headers.get("content-type") ?? ""
                // An HTML error page served with 200 is not a cover.
                return type.startsWith("text/html") ? "broken" : "ok"
            }
            return "unknown"
        } catch {
            return "unknown"
        } finally {
            clearTimeout(timer)
        }
    }
    return "unknown"
}

export type CoverDecision = "unchanged" | "updated" | "kept_old"

export interface CoverChoice {
    url: string | null
    decision: CoverDecision
    /** State of the URL that ends up stored. */
    probe: CoverProbe
}

/**
 * Which cover URL the sync should store. The new URL wins unless it is
 * definitively broken while the old one still loads.
 */
export async function chooseCoverUrl(
    oldUrl: string | null,
    newUrl: string | null,
    probe: (url: string | null) => Promise<CoverProbe> = (u) => probeCoverUrl(u)
): Promise<CoverChoice> {
    if (oldUrl === newUrl) return { url: newUrl, decision: "unchanged", probe: await probe(newUrl) }

    const next = await probe(newUrl)
    const nextUnusable = next === "broken" || next === "missing"
    if (!nextUnusable || !oldUrl) return { url: newUrl, decision: "updated", probe: next }

    const previous = await probe(oldUrl)
    if (previous === "ok") return { url: oldUrl, decision: "kept_old", probe: previous }
    return { url: newUrl, decision: "updated", probe: next }
}
