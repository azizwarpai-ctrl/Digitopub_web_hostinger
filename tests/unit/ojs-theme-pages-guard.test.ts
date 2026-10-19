import { describe, it, expect } from "vitest"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

// SubmitManager redesign PR 2: page-level contracts (see .router/PLAN.md).
// Each describe block is owned by one build task (P2-P7).

const ROOT = path.resolve(__dirname, "../..")
const THEME = path.join(ROOT, "ojs-theme/digitopub")
const STYLES = path.join(THEME, "styles")
const PAGES = path.join(THEME, "templates/frontend/pages")
const read = (p: string) => readFileSync(p, "utf8")
const tpl = (name: string) => read(path.join(PAGES, `${name}.tpl`))
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length

function walk(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return walk(full, ext)
    return full.endsWith(ext) ? [full] : []
  })
}

/** Smarty block tags must balance or OJS renders a fatal error page. */
function expectSmartyBalanced(src: string, label: string) {
  for (const t of ["if", "foreach", "capture", "strip"]) {
    const open = count(src, new RegExp(`\\{${t}[\\s}]`, "g"))
    const close = count(src, new RegExp(`\\{/${t}\\}`, "g"))
    expect(close, `${label}: {${t}} balance`).toBe(open)
  }
}

// ── P2: cover thumbnails ─────────────────────────────────────────────────────

describe("P2 cover thumbnails (E3)", () => {
  const php = () => read(path.join(THEME, "DigitopubThemePlugin.php"))

  it("generates WebP thumbnails with GD under a source-mtime name", () => {
    const src = php()
    expect(src).toMatch(/public function coverThumb\(int \$journalId, \$image\): \?array/)
    expect(src).toMatch(/imagewebp\(/)
    expect(src).toMatch(/dp-thumb-/)
    expect(src).toMatch(/filemtime\(/)
  })

  it("never modifies the original upload", () => {
    const body = php().split("public function coverThumb")[1] ?? ""
    expect(body).not.toMatch(/\b(unlink|rename)\s*\(\s*\$source/)
    expect(body).toMatch(/return null;/) // graceful fallback path exists
  })
})

// ── P3: portal pages ─────────────────────────────────────────────────────────

describe("P3 journal home is a focused submission portal", () => {
  const src = () => tpl("indexJournal")

  it("has exactly one primary button (one primary CTA per view)", () => {
    expect(count(src(), /digitopub-btn--primary/g)).toBe(1)
    expect(src()).not.toMatch(/digitopub-btn--accent/)
  })

  it("uses the agreed labels and no duplicate 'Submissions' intent", () => {
    expect(src()).toContain("New submission")
    expect(src()).toContain("Author guidelines")
    expect(src()).toContain("View on DigitoPub")
    expect(src()).not.toMatch(/translate key="about\.submissions"/)
  })

  it("renders the hero cover from thumbnails, eagerly, with an original fallback", () => {
    expect(src()).toContain("$digitopubCoverThumbs")
    expect(src()).toMatch(/srcset=/)
    expect(src()).toMatch(/fetchpriority="high"/)
    expect(src()).toMatch(/dp-portal-hero/)
    expect(src()).toMatch(/dp-steps/)
  })

  it("is valid Smarty", () => expectSmartyBalanced(src(), "indexJournal"))
})

describe("P3 site home lists journals with a single real filter", () => {
  const src = () => tpl("indexSite")
  const js = () => read(path.join(THEME, "js/digitopub.js"))

  it("drops the fake filters and the emoji services aside", () => {
    expect(src()).not.toMatch(/digitopub-filter-(category|type|sort)/)
    expect(src()).not.toMatch(/digitopub-services/)
    expect(js()).not.toMatch(/digitopub-filter-(category|type|sort)/)
  })

  it("keeps a labelled journal search wired to the grid", () => {
    expect(src()).toMatch(/<label[^>]+for="digitopub-filter-search"/)
    expect(src()).toContain('id="digitopub-filter-search"')
    expect(src()).toContain('id="digitopub-journals-grid"')
    expect(js()).toContain("digitopub-filter-search")
  })

  it("renders cards from lazy WebP thumbnails", () => {
    expect(src()).toMatch(/dp-journal-card/)
    expect(src()).toContain("$digitopubCoverThumbs")
    expect(src()).toMatch(/loading="lazy"/)
    expect(src()).toMatch(/srcset=/)
  })

  it("is valid Smarty", () => expectSmartyBalanced(src(), "indexSite"))
})

// ── P4: auth pages ───────────────────────────────────────────────────────────

describe("P4 auth pages keep every OJS form contract (C4)", () => {
  it("login keeps its form, fields and wrapper", () => {
    const src = tpl("userLogin")
    expect(src).toMatch(/<form[^>]*id="login"[^>]*method="post"[^>]*action="\{\$loginUrl\}"/)
    for (const f of ["username", "password", "remember", "source"]) expect(src, f).toContain(`name="${f}"`)
    expect(src).toContain("digitopub-auth-page")
  })

  it("register keeps the four OJS includes and consent/reviewer fields", () => {
    const src = tpl("userRegister")
    expect(src).toMatch(/<form[^>]*id="register"/)
    for (const inc of ["form/orcidProfile.tpl", "common/formErrors.tpl", "frontend/components/registrationForm.tpl", "frontend/components/registrationFormContexts.tpl"]) {
      expect(src, inc).toContain(`{include file="${inc}"`)
    }
    for (const f of ['name="privacyConsent', 'name="emailConsent"', 'name="reviewerGroup[', 'name="interests"', 'name="source"']) expect(src, f).toContain(f)
  })

  it("lost password keeps its form and field", () => {
    const src = tpl("userLostPassword")
    expect(src).toMatch(/<form[^>]*id="lostPasswordForm"/)
    expect(src).toContain('name="email"')
  })
})

describe("P4 auth pages are one focused form column", () => {
  const pages = ["userLogin", "userRegister", "userLostPassword"]

  it.each(pages)("%s drops the decorative brand panel and in-input icons", (p) => {
    const src = tpl(p)
    expect(src).not.toMatch(/digitopub-auth-brand/)
    expect(src).not.toMatch(/Scientific Journals Platform/)
    expect(src).not.toMatch(/digitopub-auth-form__icon/)
    expect(src).toMatch(/class="dp-auth[ "]/)
    expectSmartyBalanced(src, p)
  })

  it("names the task in each H1", () => {
    expect(tpl("userLogin")).toMatch(/<h1[^>]*>\s*Log in\s*<\/h1>/)
    expect(tpl("userRegister")).toMatch(/<h1[^>]*>\s*Create your account\s*<\/h1>/)
    expect(tpl("userLostPassword")).toMatch(/<h1[^>]*>\s*Reset your password\s*<\/h1>/)
  })

  it("puts 'keep me logged in' and 'forgot password' on one row", () => {
    expect(tpl("userLogin")).toMatch(/dp-auth__row[\s\S]{0,600}name="remember"[\s\S]{0,600}lostPassword/)
  })
})

// ── P5: content pages ────────────────────────────────────────────────────────

describe("P5 content pages override OJS core without losing behaviour (C5)", () => {
  const core: Record<string, string[]> = JSON.parse(read(path.join(ROOT, "tests/fixtures/ojs-core-content-tags.json")))
  const names = ["submissions", "contact", "navigationMenuItemViewContent"]

  it.each(names)("%s keeps every core include/translate/url/hook tag", (name) => {
    const src = tpl(name).replace(/\s+/g, " ")
    for (const tag of core[name]) expect(src, tag).toContain(`{${tag}`)
  })

  it.each(names)("%s uses the prose layout and is valid Smarty", (name) => {
    const src = tpl(name)
    expect(src).toMatch(/class="dp-prose[ "]/)
    expectSmartyBalanced(src, name)
  })

  it("submissions shows the login/register prompt as a notice", () => {
    expect(tpl("submissions")).toMatch(/dp-notice/)
  })

  it("ships a progressive-enhancement TOC script", () => {
    const js = read(path.join(THEME, "js/toc.js"))
    expect(js).toMatch(/dp-prose__toc/)
    expect(js).toMatch(/IntersectionObserver|querySelectorAll\(/)
  })
})

// ── P6: legacy previews on tokens ────────────────────────────────────────────

describe("P6 no literal colours anywhere outside tokens.less", () => {
  it("every LESS partial except tokens uses only design tokens for colour", () => {
    for (const f of walk(STYLES, ".less").filter((f) => !f.endsWith("tokens.less"))) {
      const code = read(f).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
      expect(code, path.relative(ROOT, f)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i)
    }
  })
})

// ── Review fixes (Phase 4 reviewer findings, verified) ───────────────────────

describe("review fixes", () => {
  const pageTpls = ["indexJournal", "indexSite", "userLogin", "userRegister", "userLostPassword", "submissions", "contact", "navigationMenuItemViewContent"]

  it.each(pageTpls)("%s adds no second <main> (header.tpl already has role=main)", (p) => {
    expect(tpl(p)).not.toMatch(/<main[\s>]/)
  })

  it("link-coloured text in page partials uses --link, not --primary (dark AA)", () => {
    for (const f of walk(path.join(STYLES, "pages"), ".less")) {
      expect(read(f), path.relative(ROOT, f)).not.toMatch(/(^|[^-])color:\s*var\(--primary\)/m)
    }
  })

  it("repeated card links name their journal for screen readers (WCAG 2.4.4)", () => {
    const src = tpl("indexSite")
    expect(src).toMatch(/>Submit<span class="pkp_screen_reader"> to \{\$journal->getLocalizedName\(\)\|escape\}<\/span>/)
    expect(src).toMatch(/View on DigitoPub<span class="pkp_screen_reader">: \{\$journal->getLocalizedName\(\)\|escape\}<\/span>/)
  })

  it.each(["userLogin", "userRegister", "userLostPassword"])("%s re-enables its submit button on back/forward cache restore", (p) => {
    expect(tpl(p)).toMatch(/addEventListener\('pageshow'[\s\S]{0,200}persisted[\s\S]{0,200}disabled = false/)
  })

  it("initials are truncated before escaping (no half HTML entities)", () => {
    for (const p of ["indexJournal", "indexSite"]) expect(tpl(p), p).not.toMatch(/\|escape\|truncate/)
  })

  it("thumbnail generation cannot fatally exhaust memory or warn on every request", () => {
    const php = read(path.join(THEME, "DigitopubThemePlugin.php"))
    expect(php).toMatch(/getimagesize\(\$source\)/)
    expect(php).toMatch(/MAX_THUMB_SOURCE_PIXELS/)
    expect(php).toMatch(/is_writable\(\$dir\)/)
    expect(php).toMatch(/@imagewebp\(/)
  })
})

// ── P7: dark mode back on ────────────────────────────────────────────────────

describe("P7 dark mode follows the system again (E2)", () => {
  const tokens = () => read(path.join(STYLES, "tokens.less")).replace(/\/\/.*$/gm, "")

  it("legacy page partials are gone", () => {
    for (const f of ["site-home", "journal-home", "auth"]) expect(existsSync(path.join(STYLES, `legacy/${f}.less`)), f).toBe(false)
  })

  it("applies DigitoPub dark tokens via prefers-color-scheme", () => {
    expect(tokens()).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{/)
    expect(tokens()).toMatch(/color-scheme:\s*light dark;/)
  })

  it("defines a readable --link token for both schemes and uses it for links", () => {
    expect(tokens()).toMatch(/--link:\s*var\(--primary\)/)
    expect(tokens()).toMatch(/--link:\s*oklch\(0\.72 0\.12 250\)/)
    expect(read(path.join(STYLES, "base.less"))).toMatch(/\.pkp_structure_page a\s*\{[^}]*color:\s*var\(--link\)/)
  })

  it("inverts the dark-ink logo in dark mode", () => {
    expect(read(path.join(STYLES, "components/navbar.less"))).toMatch(/prefers-color-scheme:\s*dark[\s\S]*__brand img[\s\S]*filter:\s*brightness\(0\) invert\(1\)/)
  })
})
