import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

// #183 — SubmitManager (OJS) is submission-only. Reader-facing OJS URLs are
// 301-redirected to digitopub.com by the mod_rewrite block in
// ojs-theme/htaccess/submission-only.conf (pasted into the OJS .htaccess).
// This test evaluates THAT file with a minimal mod_rewrite simulator so the
// redirect matrix is checked in CI, not only by curl after deploy.

const CONF_PATH = path.resolve(__dirname, "../../ojs-theme/htaccess/submission-only.conf")
const DIGITOPUB = "https://digitopub.com"

interface Rule {
  conds: { negate: boolean; pattern: RegExp }[]
  pattern: RegExp
  substitution: string
  flags: Set<string>
}

/** Parse the subset of mod_rewrite syntax the conf file is allowed to use. */
function parseRules(source: string): Rule[] {
  const rules: Rule[] = []
  let pendingConds: Rule["conds"] = []
  for (const raw of source.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const [directive, a, b, flagText = ""] = line.split(/\s+/)
    if (directive === "RewriteCond") {
      if (a !== "%{QUERY_STRING}") throw new Error(`Unsupported RewriteCond test string: ${a}`)
      const negate = b.startsWith("!")
      pendingConds.push({ negate, pattern: new RegExp(negate ? b.slice(1) : b) })
    } else if (directive === "RewriteRule") {
      const flags = new Set(flagText.replace(/^\[|\]$/g, "").split(",").filter(Boolean))
      rules.push({ conds: pendingConds, pattern: new RegExp(a), substitution: b, flags })
      pendingConds = []
    } else {
      throw new Error(`Unsupported directive in submission-only.conf: ${directive}`)
    }
  }
  return rules
}

/** Apply rules to a request path (per-directory context: no leading slash). */
function rewrite(rules: Rule[], url: string): { status: number; location: string } | null {
  const [rawPath, query = ""] = url.replace(/^\//, "").split("?")
  for (const rule of rules) {
    const match = rule.pattern.exec(rawPath)
    if (!match) continue
    let condMatch: RegExpExecArray | null = null
    const condsPass = rule.conds.every(({ negate, pattern }) => {
      const m = pattern.exec(query)
      if (!negate && m) condMatch = m
      return negate ? !m : Boolean(m)
    })
    if (!condsPass) continue

    let location = rule.substitution
      .replace(/\$(\d)/g, (_, n) => match[Number(n)] ?? "")
      .replace(/%(\d)/g, (_, n) => (condMatch as RegExpExecArray | null)?.[Number(n)] ?? "")
    // Without QSD, mod_rewrite appends the original query when the
    // substitution has none of its own.
    if (!location.includes("?") && query && !rule.flags.has("QSD")) location += `?${query}`

    const redirect = [...rule.flags].find((f) => f.startsWith("R="))
    if (!redirect || !rule.flags.has("L")) throw new Error(`Rule for ${rule.pattern} must be [R=301,L,...]`)
    return { status: Number(redirect.slice(2)), location }
  }
  return null
}

const rules = parseRules(readFileSync(CONF_PATH, "utf8"))
const go = (url: string) => rewrite(rules, url)

describe("submission-only.conf — reader pages 301 to DigitoPub", () => {
  it.each([
    // Issues & archive
    ["/ojbr/issue/archive", "/journals/ojbr/archive"],
    ["/ojbr/issue/archive/2", "/journals/ojbr/archive"],
    ["/ijmp/issue/current", "/journals/ijmp/current-issue"],
    // About & board pages
    ["/ojbr/about", "/journals/ojbr"],
    ["/ojbr/about/", "/journals/ojbr"],
    ["/ojbr/about/editorialMasthead", "/journals/ojbr/about-journal/editorial-board"],
    ["/ojbr/about/privacy", "/journals/ojbr/policies/privacy-statement"],
    ["/ojbr/journal-information", "/journals/ojbr"],
    ["/jirdm/journalinformation", "/journals/jirdm"],
    ["/ojbr/browse", "/journals/ojbr"],
    ["/ojbr/editorial-board", "/journals/ojbr/about-journal/editorial-board"],
    ["/ojbr/advisory-board", "/journals/ojbr/about-journal/advisory-board"],
    ["/ojbr/aims-scope", "/journals/ojbr/about-journal/aims-scope"],
    ["/ojbr/author-guidelines", "/journals/ojbr/author-guidelines"],
    ["/ojbr/for-authors", "/journals/ojbr/author-guidelines"],
    // Policy pages (slug mapping matches #182)
    ["/ojbr/policies", "/journals/ojbr/policies"],
    ["/jme/journal-policies", "/journals/jme/policies"],
    ["/ojbr/copyright-licensing-policies", "/journals/ojbr/policies/copyright-licensing"],
    ["/ojbr/policies-on-ethics", "/journals/ojbr/policies/policies-on-ethics"],
    ["/ojbr/policies-on-ethics/", "/journals/ojbr/policies/policies-on-ethics"],
    ["/ojbr/editorial-workflow", "/journals/ojbr/policies/editorial-workflow"],
    ["/ojbr/indexing-archiving", "/journals/ojbr/policies/indexing-archiving"],
    ["/ojbr/dois-orcid", "/journals/ojbr/policies/dois-orcid"],
    ["/ojbr/repository-policy", "/journals/ojbr/policies/repository-policy"],
    // Unknown future policy paths land on the Policies tab (slug may be aliased)
    ["/ojbr/data-sharing-policy", "/journals/ojbr/policies"],
  ])("%s → %s", (from, to) => {
    expect(go(from)).toEqual({ status: 301, location: `${DIGITOPUB}${to}` })
  })
})

describe("submission-only.conf — search goes to DigitoPub search", () => {
  it.each([
    ["/ojbr/search?query=heart", "/search?q=heart"],
    ["/ojbr/search/search?query=dental%20caries", "/search?q=dental%20caries"],
    ["/ojbr/search/search?searchJournal=2&query=x&page=2", "/search?q=x"],
    ["/ojbr/search/authors", "/search"],
    ["/ojbr/search", "/search"],
    ["/ojbr/search?foo=1", "/search"],
    ["/index/search?query=x", "/search?q=x"],
  ])("%s → %s", (from, to) => {
    expect(go(from)).toEqual({ status: 301, location: `${DIGITOPUB}${to}` })
  })
})

describe("submission-only.conf — submission, workflow and storage are untouched", () => {
  it.each([
    "/",
    "/index",
    "/index/about",
    "/ojbr",
    "/ojbr/index",
    "/ojbr/about/submissions",
    "/ojbr/about/contact",
    "/ojbr/publication-fees",
    "/ojbr/login",
    "/ojbr/login/signOut",
    "/ojbr/user/register",
    "/ojbr/user/profile",
    "/ojbr/submission/wizard",
    "/ojbr/submissions",
    "/ojbr/dashboard",
    "/ojbr/workflow/index/12/1",
    "/ojbr/management/settings/website",
    "/ojbr/stats/publications",
    "/ojbr/$$$call$$$/grid/users/user-grid/fetch-grid",
    "/ojbr/api/v1/submissions",
    "/ojbr/article/download/200048/200107",
    "/ojbr/article/view/200072", // #175 rule in .htaccess, not this block
    "/ojbr/issue/view/200009", // handled by the theme plugin (needs DB lookup)
    "/ojbr/issue/download/1/2",
    "/ojbr/preview/12",
    "/ojbr/oai",
    "/ojbr/payment/plugin/paypal",
    "/ojbr/notification",
    "/public/journals/2/cover_issue_9_en.png",
    "/ojs-pdf-bridge.php",
    "/ojs-user-bridge.php",
    "/sso_login.php",
  ])("%s is not redirected", (url) => {
    expect(go(url)).toBeNull()
  })
})

describe("submission-only.conf — safety", () => {
  it("never redirects the site-level 'index' context to a journal page", () => {
    for (const url of ["/index/about", "/index/issue/archive", "/index/editorial-board", "/index/policies"]) {
      expect(go(url)).toBeNull()
    }
  })

  it("only ever redirects to digitopub.com", () => {
    for (const rule of rules) expect(rule.substitution.startsWith(`${DIGITOPUB}/`)).toBe(true)
  })
})
