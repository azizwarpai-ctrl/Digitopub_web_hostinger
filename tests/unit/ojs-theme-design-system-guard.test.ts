import { describe, it, expect } from "vitest"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

// SubmitManager (OJS theme) shares DigitoPub's design system. These guards
// keep the theme on that system and away from the less.php traps documented
// in ojs-theme/check-less.sh (clamp() silently collapses, calc(var()) and
// min()/max() fail to compile).

const ROOT = path.resolve(__dirname, "../..")
const THEME = path.join(ROOT, "ojs-theme/digitopub")
const STYLES = path.join(THEME, "styles")
const read = (p: string) => readFileSync(p, "utf8")

function walk(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return walk(full, ext)
    return full.endsWith(ext) ? [full] : []
  })
}

const lessFiles = () => walk(STYLES, ".less")
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/")

// ── Token parity with DigitoPub ──────────────────────────────────────────────

const TOKENS = [
  "background", "foreground", "card", "card-foreground", "primary", "primary-foreground",
  "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground",
  "destructive", "border", "input", "ring",
] as const

/** `--name: value;` pairs inside the first block that follows `selectorRe`. */
function tokensIn(source: string, selectorRe: RegExp): Record<string, string> {
  const start = source.search(selectorRe)
  if (start === -1) return {}
  const open = source.indexOf("{", start)
  // Take the first innermost block containing custom properties.
  let depth = 0, i = open, end = open
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++
    else if (source[i] === "}" && --depth === 0) { end = i; break }
  }
  const body = source.slice(open + 1, end)
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g)) out[m[1]] ??= m[2].trim()
  return out
}

describe("design tokens match DigitoPub (app/globals.css)", () => {
  const globals = read(path.join(ROOT, "app/globals.css"))
  const tokensPath = path.join(STYLES, "tokens.less")
  const tokens = existsSync(tokensPath) ? read(tokensPath) : ""

  it("light tokens are identical", () => {
    const dp = tokensIn(globals, /:root\s*\{/)
    const sm = tokensIn(tokens, /:root\s*\{/)
    for (const t of TOKENS) expect(sm[t], `--${t}`).toBe(dp[t])
    expect(sm.radius).toBe(dp.radius)
  })

  it("dark tokens are identical (DigitoPub .dark == theme dark block)", () => {
    const dp = tokensIn(globals, /\n\.dark\s*\{/)
    // Opt-in block (PR 1 mitigation) or the system-driven block (PR 2).
    const sm = tokensIn(tokens, /:root\[data-sm-theme="dark"\]\s*\{|@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{/)
    for (const t of TOKENS) expect(sm[t], `--${t}`).toBe(dp[t])
  })

  // Dark mode stays opt-in until the legacy page partials (site home,
  // journal home, auth) stop hard-coding light surfaces: with dark tokens
  // auto-applied, login rendered white text on a white card (axe 1.06:1).
  it("does not auto-apply dark mode while legacy page partials exist", () => {
    const legacyLeft = existsSync(path.join(STYLES, "legacy/auth.less"))
    if (!legacyLeft) return
    const code = tokens.replace(/\/\/.*$/gm, "")
    expect(code).not.toMatch(/prefers-color-scheme:\s*dark/)
    expect(code).toMatch(/color-scheme:\s*light;/)
  })
})

// ── Stylesheet structure ─────────────────────────────────────────────────────

const ENTRY_IMPORTS = [
  "tokens.less",
  "base.less",
  "components/button.less",
  "components/navbar.less",
  "components/footer.less",
  "components/notice.less",
  "pages/portal.less",
  "pages/auth.less",
  "pages/prose.less",
  "legacy/issue-preview.less",
  "legacy/article-preview.less",
]

describe("stylesheet structure", () => {
  it("digitopub.less only imports partials, in contract order", () => {
    const entry = read(path.join(STYLES, "digitopub.less"))
    const code = entry.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim()
    const imports = [...code.matchAll(/@import\s+(?:\(\w+\)\s+)?["']([^"']+)["'];/g)].map((m) => m[1])
    expect(imports).toEqual(ENTRY_IMPORTS)
    expect(code.replace(/@import[^;]+;/g, "").trim()).toBe("")
    for (const f of ENTRY_IMPORTS) expect(existsSync(path.join(STYLES, f)), f).toBe(true)
  })

  it("has no plain .css files (everything goes through the one LESS bundle)", () => {
    expect(walk(STYLES, ".css").map(rel)).toEqual([])
  })

  it("defines each shell component once (one top-level rule; nested/contextual overrides allowed)", () => {
    const all = lessFiles().map(read).join("\n")
    for (const block of ["digitopub-btn", "digitopub-navbar", "digitopub-footer"]) {
      const defs = all.match(new RegExp(`^\\.${block}\\s*\\{`, "gm")) ?? []
      expect(defs.length, `.${block} definitions`).toBe(1)
    }
  })
})

// ── LESS hygiene (less.php traps + brand) ────────────────────────────────────

describe("LESS hygiene", () => {
  it("never uses !important", () => {
    for (const f of lessFiles()) expect(read(f), rel(f)).not.toMatch(/!important/)
  })

  it("escapes every CSS math function (less.php miscompiles bare clamp/calc/min/max)", () => {
    for (const f of lessFiles()) {
      read(f).split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "")
        if (/(?<![\w-])(calc|clamp|min|max)\(/.test(code)) {
          expect(code, `${rel(f)}:${i + 1}`).toMatch(/~"[^"]*(calc|clamp|min|max)\(/)
        }
      })
    }
  })

  it("has no pill radii or retired brand colours (teal / navy)", () => {
    for (const f of lessFiles()) {
      const src = read(f)
      expect(src, rel(f)).not.toMatch(/9999px/)
      expect(src, rel(f)).not.toMatch(/#(2a7f7f|1f6161|0a1f3d|06172b|14335c)\b/i)
    }
  })

  it("new layers (base + components) use only tokens for colour", () => {
    const fresh = lessFiles().filter((f) => /[\\/](base\.less|components[\\/])/.test(f))
    expect(fresh.length).toBeGreaterThan(0)
    for (const f of fresh) {
      const code = read(f).replace(/\/\/.*$/gm, "")
      expect(code, rel(f)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i)
    }
  })
})

// ── Fonts & icons ────────────────────────────────────────────────────────────

describe("vendored brand assets", () => {
  it("ships Geist + Geist Mono with the OFL licence", () => {
    for (const f of ["Geist-Variable.woff2", "GeistMono-Variable.woff2", "OFL.txt"]) {
      expect(existsSync(path.join(THEME, "fonts", f)), f).toBe(true)
    }
  })

  it("loads Geist via @font-face from the absolute theme URL", () => {
    const base = read(path.join(STYLES, "base.less"))
    expect(base).toMatch(/@font-face[\s\S]*font-family:\s*"Geist"/)
    expect(base).toContain('url("@{baseUrl}/plugins/themes/digitopub/fonts/Geist-Variable.woff2")')
    expect(base).toMatch(/font-display:\s*swap/)
  })

  const ICONS = ["menu", "x", "layout-dashboard", "log-in", "user-plus", "book-open", "external-link", "file-plus", "arrow-right"]
  it.each(ICONS)("icon partial %s is a decorative Lucide SVG", (name) => {
    const svg = read(path.join(THEME, "templates/frontend/components/icons", `${name}.tpl`)).trim()
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain('class="dp-icon')
    expect(svg).toContain('aria-hidden="true"')
    expect(svg).toContain('focusable="false"')
    expect(svg).toContain('stroke="currentColor"')
    expect(svg).not.toMatch(/[{}]/) // Smarty delimiters must not appear in markup
  })
})

// ── Templates ────────────────────────────────────────────────────────────────

describe("templates load styles only through the theme bundle", () => {
  const templates = walk(path.join(THEME, "templates"), ".tpl")
  it.each(templates.map((f) => [rel(f), f]))("%s has no stylesheet <link> or Google Fonts", (_, f) => {
    const tpl = read(f)
    expect(tpl).not.toMatch(/<link[^>]+rel="stylesheet"/)
    expect(tpl).not.toContain("fonts.googleapis.com")
  })
})

describe("button labels survive the base link colour", () => {
  // base.less colours links via `.pkp_structure_page a` (0,1,1). A filled
  // button rendered as <a> needs >= (0,2,0) or its label turns primary-on-
  // primary (unreadable CTA). Link :hover must not set a colour either.
  it("filled/outline buttons restate their label colour at .pkp_structure_page specificity", () => {
    const btn = read(path.join(STYLES, "components/button.less"))
    expect(btn).toMatch(/\.pkp_structure_page \.digitopub-btn--primary[\s\S]*?color:\s*var\(--primary-foreground\)/)
    expect(btn).toMatch(/\.pkp_structure_page \.digitopub-btn--outline[\s\S]*?color:\s*var\(--foreground\)/)
  })

  it("base link hover never changes colour", () => {
    const base = read(path.join(STYLES, "base.less"))
    const hover = base.match(/\.pkp_structure_page a:hover\s*\{([^}]*)\}/)
    expect(hover).not.toBeNull()
    expect(hover![1]).not.toMatch(/(^|[^-])color\s*:/)
  })
})

describe("stylesheet URLs change every release (D7)", () => {
  // SiteGround's proxy caches the cookie-less css?name=<style> responses
  // indefinitely; a fixed name served July 2026 CSS until this fix.
  const php = () => read(path.join(THEME, "DigitopubThemePlugin.php"))

  it("registers the theme bundle under a content-versioned name", () => {
    expect(php()).not.toMatch(/'digitopub-styles-v\d+'/)
    expect(php()).toMatch(/addStyle\(\s*'digitopub-styles-'\s*\.\s*\$\w+/)
  })

  it("derives the version from the stylesheet files and the plugin itself", () => {
    expect(php()).toMatch(/function\s+assetVersion\s*\(/)
    expect(php()).toMatch(/filemtime/)
    expect(php()).toMatch(/__FILE__/)
  })

  it("re-keys the parent stylesheet after the D6 variables are applied", () => {
    const src = php()
    const modify = src.indexOf("modifyStyle('stylesheet'")
    const rekey = src.search(/->styles\['stylesheet-'\s*\.\s*\$\w+\]\s*=/)
    expect(modify).toBeGreaterThan(-1)
    expect(rekey).toBeGreaterThan(modify)
    expect(src).toMatch(/unset\(\s*\$this->parent->styles\['stylesheet'\]\s*\)/)
  })
})

describe("parent default theme is re-skinned at the LESS-variable source (D6)", () => {
  const php = () => read(path.join(THEME, "DigitopubThemePlugin.php"))

  it("overrides the parent's font and base colour with DigitoPub values", () => {
    const src = php()
    expect(src).toMatch(/modifyStyle\(\s*'stylesheet'/)
    expect(src).toMatch(/@font:\s*"Geist"/)
    expect(src).toMatch(/@bg-base:\s*#0056a4/i) // sRGB of oklch(0.45 0.15 250)
  })

  it("drops the parent's unused Noto Sans webfont", () => {
    expect(php()).toMatch(/removeStyle\(\s*'font'\s*\)/)
  })
})

describe("base layer fixes the OJS default-theme shell", () => {
  const base = () => read(path.join(STYLES, "base.less"))

  it("uses Geist for body text", () => {
    expect(base()).toMatch(/font-family:\s*var\(--font-sans\)/)
  })

  it("removes the default theme's 30px band above page content", () => {
    expect(base()).toMatch(/\.pkp_structure_content\s*\{[^}]*padding-top:\s*0/)
  })

  it("keeps h1 >= 28px at the default theme's 14px root (clamp minimum 2rem)", () => {
    expect(base()).toMatch(/\.pkp_structure_main h1\s*\{[^}]*font-size:\s*~"clamp\(2rem,/)
  })

  it("provides a visible keyboard focus ring and honours reduced motion", () => {
    expect(base()).toMatch(/:focus-visible\s*\{[^}]*outline:[^;]*var\(--ring\)/)
    expect(base()).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  })
})
