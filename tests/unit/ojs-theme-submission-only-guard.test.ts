import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

// #183 — SubmitManager (OJS) must not display issues or articles. These
// guards pin the theme's public chrome to the submission-only contract so a
// later template edit can't quietly reintroduce reader content.

const THEME = path.resolve(__dirname, "../../ojs-theme/digitopub")
const read = (rel: string) => readFileSync(path.join(THEME, rel), "utf8")

const READER_LINKS = [
  /page="issue"/, // current issue / archive / issue view
  /article_summary\.tpl/, // article listings
  /\$publishedSubmissions/, // current-issue article loop
  /url page="search"/, // OJS search (lists articles)
]

describe("journal home (indexJournal.tpl) is a submission portal", () => {
  const tpl = read("templates/frontend/pages/indexJournal.tpl")

  it.each(READER_LINKS.map((re) => [re.source, re] as const))("has no reader content: %s", (_, re) => {
    expect(tpl).not.toMatch(re)
  })

  it("offers the submission entry points", () => {
    expect(tpl).toContain('page="submission" op="wizard"')
    expect(tpl).toContain('page="about" op="submissions"')
    expect(tpl).toContain('page="login"')
    expect(tpl).toContain('page="user" op="register"')
  })

  it("links readers to the journal on DigitoPub", () => {
    expect(tpl).toContain('https://digitopub.com/journals/{$currentJournal->getPath()|escape:"url"}')
  })
})

describe("site home (indexSite.tpl) journal cards", () => {
  const tpl = read("templates/frontend/pages/indexSite.tpl")

  it("has no current-issue or about links", () => {
    expect(tpl).not.toMatch(/page="issue"/)
    expect(tpl).not.toMatch(/page="about"/)
  })

  it("offers Submit and View on DigitoPub per journal", () => {
    expect(tpl).toContain('page="submission" op="wizard"')
    expect(tpl).toContain('https://digitopub.com/journals/{$journal->getPath()|escape:"url"}')
  })
})

describe("shared chrome", () => {
  it("footer sends readers to DigitoPub, not OJS reader pages", () => {
    const tpl = read("templates/frontend/components/footer.tpl")
    expect(tpl).not.toMatch(/page="issue"/)
    expect(tpl).not.toMatch(/url page="search"/)
    expect(tpl).not.toMatch(/url page="journals"/)
    expect(tpl).not.toMatch(/url page="about"\}/)
    expect(tpl).toContain("https://digitopub.com/journals")
    expect(tpl).toContain("https://digitopub.com/search")
    expect(tpl).toContain('url page="login"')
  })

  it("navbar search queries DigitoPub search directly", () => {
    const tpl = read("templates/frontend/components/digitopubNavbar.tpl")
    expect(tpl).not.toMatch(/url page="search"/)
    expect(tpl.match(/action="https:\/\/digitopub\.com\/search"/g)).toHaveLength(2)
    expect(tpl).not.toMatch(/name="query"/)
    expect(tpl.match(/name="q"/g)).toHaveLength(2)
  })
})

describe("theme script robustness", () => {
  const js = read("js/digitopub.js")

  it("resolves in-page anchor targets by id, never as a CSS selector built from href", () => {
    // querySelector('#1-intro') throws a DOMException (invalid selector) and
    // aborts the click handler; getElementById takes any id verbatim.
    expect(js).not.toMatch(/querySelector\(\s*targetId\s*\)/)
    expect(js).toMatch(/getElementById\(\s*targetId\.slice\(1\)\s*\)/)
  })
})

describe("theme plugin redirects issue pages", () => {
  const php = read("DigitopubThemePlugin.php")

  it("hooks template display to redirect frontend/pages/issue.tpl", () => {
    expect(php).toMatch(/Hook::add\('TemplateManager::display', \[\$this, 'redirectIssuePage'\]\)/)
    expect(php).toContain("'frontend/pages/issue.tpl'")
    expect(php).toContain("DIGITOPUB_BASE_URL = 'https://digitopub.com'")
    expect(php).toMatch(/self::DIGITOPUB_BASE_URL \. '\/journals\/'/)
  })

  it("sends a permanent redirect", () => {
    expect(php).toMatch(/301/)
  })
})
