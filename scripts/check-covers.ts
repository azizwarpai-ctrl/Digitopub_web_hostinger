/**
 * Production cover monitor (#239).
 *
 * Journal covers broke three times without anyone noticing, because the site
 * falls back to a placeholder silently. This checks every active journal's
 * cover exactly the way visitors load it (through /api/image-proxy) and
 * exits 1 when any cover does not load. Run hourly by
 * .github/workflows/cover-monitor.yml, which opens or updates a GitHub issue
 * on failure; also runnable by hand:
 *
 *   bun run scripts/check-covers.ts [--site https://digitopub.com]
 *
 * Uses HEAD (no image download) and needs no secrets. Prints a Markdown
 * report to stdout.
 */

interface ApiJournal {
  title: string
  ojs_path: string | null
  cover_image_url: string | null
  status: string | null
}

interface Result {
  journal: string
  path: string
  cover: string | null
  status: number | "no cover" | "error"
  ok: boolean
}

/** Table cell text: no pipes (break the table) and no @mentions (would notify). */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/@/g, "@\u200b")
}

const siteArg = process.argv.indexOf("--site")
const SITE = (siteArg > -1 ? process.argv[siteArg + 1] : process.env.SITE_URL || "https://digitopub.com").replace(/\/$/, "")
const TIMEOUT_MS = 20_000

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** The URL a browser requests for this cover (mirrors <OjsImage>). */
function proxiedCoverUrl(cover: string): string {
  return cover.startsWith("/") ? `${SITE}${cover}` : `${SITE}/api/image-proxy?url=${encodeURIComponent(cover)}`
}

async function checkCover(journal: ApiJournal): Promise<Result> {
  const base = { journal: journal.title, path: journal.ojs_path ?? "?", cover: journal.cover_image_url }
  // A journal without a cover is not a broken cover (the site shows the
  // designed placeholder); it is listed separately, never alarmed on.
  if (!journal.cover_image_url) return { ...base, status: "no cover", ok: true }
  try {
    const res = await fetchWithTimeout(proxiedCoverUrl(journal.cover_image_url), { method: "HEAD" })
    const type = res.headers.get("content-type") ?? ""
    return { ...base, status: res.status, ok: res.ok && type.startsWith("image/") }
  } catch {
    return { ...base, status: "error", ok: false }
  }
}

async function main(): Promise<number> {
  let journals: ApiJournal[]
  try {
    const res = await fetchWithTimeout(`${SITE}/api/journals?limit=200`)
    const body = (await res.json()) as { success?: boolean; data?: ApiJournal[] }
    if (!res.ok || !body.success || !Array.isArray(body.data)) throw new Error(`HTTP ${res.status}`)
    journals = body.data.filter((j) => j.status !== "inactive")
  } catch (error) {
    console.log(`## Cover monitor: could not load ${SITE}/api/journals\n\n${String(error)}`)
    return 1
  }

  // Small batches: /api/image-proxy caps concurrent upstream fetches, and the
  // monitor must not be what makes it answer 503 to real visitors.
  const results: Result[] = []
  for (let i = 0; i < journals.length; i += 4) {
    results.push(...(await Promise.all(journals.slice(i, i + 4).map(checkCover))))
  }
  const failed = results.filter((r) => !r.ok)
  const noCover = results.filter((r) => r.status === "no cover")
  const lines = [
    failed.length === 0
      ? `## ✅ All ${results.length} journal covers load on ${SITE}`
      : `## ❌ ${failed.length} of ${results.length} journal covers do not load on ${SITE}`,
    "",
    `Checked ${new Date().toISOString()} through \`/api/image-proxy\` (what visitors load).`,
  ]
  if (failed.length > 0) {
    lines.push("", "| Journal | Path | Result | Stored cover URL |", "|---|---|---|---|")
    for (const r of failed) lines.push(`| ${cell(r.journal)} | ${cell(r.path)} | ${r.status} | ${cell(r.cover ?? "—")} |`)
    lines.push(
      "",
      "Likely causes and fixes: `docs/ojs-image-pipeline.md`. " +
        "The usual one is a stored URL built from the OJS `name` instead of `uploadName` (#148, #239); " +
        "after fixing the cause, run the OJS journal sync."
    )
  }
  if (noCover.length > 0) {
    lines.push("", `Journals without a cover in OJS (shown with the placeholder, not a failure): ${noCover.map((r) => cell(r.path)).join(", ")}`)
  }
  console.log(lines.join("\n"))
  return failed.length === 0 ? 0 : 1
}

process.exit(await main())
