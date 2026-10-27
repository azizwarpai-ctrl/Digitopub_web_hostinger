import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { parseOjsFilename, buildOjsPublicUrl, buildOjsAssetUrl } from "@/src/features/ojs/utils/ojs-asset-url"
import { normalizeOjsAssetUrl } from "@/src/features/ojs/utils/ojs-config"

// ─── parseOjsFilename ─────────────────────────────────────────────────────────

describe("parseOjsFilename", () => {
  it("returns null for null input", () => {
    expect(parseOjsFilename(null)).toBeNull()
  })

  it("returns null for undefined input", () => {
    expect(parseOjsFilename(undefined)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseOjsFilename("")).toBeNull()
  })

  it("returns null for garbage input", () => {
    expect(parseOjsFilename("not-an-image-at-all")).toBeNull()
  })

  it("returns null for numeric-only string", () => {
    expect(parseOjsFilename("12345")).toBeNull()
  })

  // JSON format — flat
  it("parses flat JSON with uploadName", () => {
    expect(parseOjsFilename('{"uploadName":"photo.jpg"}')).toBe("photo.jpg")
  })

  it("falls back to name when JSON carries no uploadName", () => {
    // Last resort only: OJS always writes uploadName for images, but a
    // hand-edited row may carry just `name`.
    expect(parseOjsFilename('{"name":"example.png"}')).toBe("example.png")
  })

  // #148 / #239: this used to assert the opposite ("prefers name") with
  // made-up data, which kept the bug in place and got a correct fix reverted.
  // OJS writes the file to disk under `uploadName`; `name` is the original
  // filename of the upload (PKPContextService.php:826 reads uploadName).
  it("uses uploadName (the file OJS stores) over name when both are present", () => {
    expect(
      parseOjsFilename('{"name":"Journal Cover Image.png","uploadName":"homepageImage_en.png"}')
    ).toBe("homepageImage_en.png")
  })

  it("rejects extracted JSON name that is not filename-shaped", () => {
    // Belt-and-suspenders: a corrupted settings row carrying a non-filename
    // value under `name` (e.g. an empty string, a script tag, a bare word)
    // must not flow into URL construction. Falls back to null.
    expect(parseOjsFilename('{"name":"<script>"}')).toBeNull()
    expect(parseOjsFilename('{"name":"justaword"}')).toBeNull()
    expect(parseOjsFilename('{"name":""}')).toBeNull()
  })

  it("rejects extracted PHP-serialized name that is not filename-shaped", () => {
    const raw = 'a:1:{s:4:"name";s:9:"justaword";}'
    expect(parseOjsFilename(raw)).toBeNull()
  })

  // JSON format — nested locale key
  it("parses nested JSON with locale key", () => {
    const raw = JSON.stringify({ en_US: { uploadName: "cover_issue_1_en_US.png" } })
    expect(parseOjsFilename(raw)).toBe("cover_issue_1_en_US.png")
  })

  it("parses nested JSON with multiple locale keys (returns first found)", () => {
    const raw = JSON.stringify({
      en_US: { uploadName: "photo.jpg" },
      fr_FR: { uploadName: "photo_fr.jpg" },
    })
    expect(parseOjsFilename(raw)).toBe("photo.jpg")
  })

  it("returns null for JSON without name or uploadName", () => {
    // `uploadName` (the file OJS stores, preferred) and `name` (the original
    // filename, last-resort fallback) are the recognized keys. A JSON object
    // that carries neither — and no nested object that does — has nothing to extract.
    expect(parseOjsFilename('{"label":"something","value":42}')).toBeNull()
  })

  it("returns null for JSON with empty uploadName", () => {
    expect(parseOjsFilename('{"uploadName":""}')).toBeNull()
  })

  // PHP-serialized format
  it("parses PHP-serialized array with uploadName", () => {
    const raw = 'a:2:{s:10:"uploadName";s:9:"photo.jpg";s:4:"type";s:9:"image/jpg";}'
    expect(parseOjsFilename(raw)).toBe("photo.jpg")
  })

  it("parses PHP-serialized with longer filename", () => {
    const raw = 'a:1:{s:10:"uploadName";s:23:"cover_issue_1_en_US.png";}'
    expect(parseOjsFilename(raw)).toBe("cover_issue_1_en_US.png")
  })

  // Plain string — OJS prefix patterns
  it("returns plain string with cover_issue_ prefix", () => {
    expect(parseOjsFilename("cover_issue_1_en_US.png")).toBe("cover_issue_1_en_US.png")
  })

  it("returns plain string with article_ prefix", () => {
    expect(parseOjsFilename("article_123.png")).toBe("article_123.png")
  })

  it("returns plain string with cover_ prefix", () => {
    expect(parseOjsFilename("cover_journal.png")).toBe("cover_journal.png")
  })

  // Plain string — image extension
  it("returns plain .jpg string", () => {
    expect(parseOjsFilename("photo.jpg")).toBe("photo.jpg")
  })

  it("returns plain .jpeg string", () => {
    expect(parseOjsFilename("photo.jpeg")).toBe("photo.jpeg")
  })

  it("returns plain .webp string", () => {
    expect(parseOjsFilename("image.webp")).toBe("image.webp")
  })

  it("returns plain .gif string", () => {
    expect(parseOjsFilename("anim.gif")).toBe("anim.gif")
  })

  it("returns plain .PNG string (case-insensitive extension)", () => {
    expect(parseOjsFilename("photo.PNG")).toBe("photo.PNG")
  })

  it("trims surrounding whitespace from plain string", () => {
    expect(parseOjsFilename("  photo.jpg  ")).toBe("photo.jpg")
  })
})

// ─── buildOjsPublicUrl ────────────────────────────────────────────────────────

describe("buildOjsPublicUrl", () => {
  it("builds a simple URL", () => {
    expect(buildOjsPublicUrl("https://example.com", "public/journals/10", "cover.png")).toBe(
      "https://example.com/public/journals/10/cover.png"
    )
  })

  it("strips leading slash from subpath", () => {
    expect(buildOjsPublicUrl("https://example.com", "/public/journals/10", "cover.png")).toBe(
      "https://example.com/public/journals/10/cover.png"
    )
  })

  it("strips trailing slash from subpath", () => {
    expect(buildOjsPublicUrl("https://example.com", "public/journals/10/", "cover.png")).toBe(
      "https://example.com/public/journals/10/cover.png"
    )
  })

  it("percent-encodes the filename", () => {
    expect(
      buildOjsPublicUrl("https://example.com", "public/site/profileImages", "my photo.jpg")
    ).toBe("https://example.com/public/site/profileImages/my%20photo.jpg")
  })

  it("strips path traversal from filename (basename only)", () => {
    // path.basename("../../etc/passwd") === "passwd"
    // so the traversal is stripped and only the leaf filename survives
    const result = buildOjsPublicUrl(
      "https://example.com",
      "public/journals/10",
      "../../etc/passwd"
    )
    expect(result).toBe("https://example.com/public/journals/10/passwd")
    expect(result).not.toContain("..")
    expect(result).not.toContain("/etc/")
  })

  it("strips Windows-style backslash path traversal", () => {
    // path.basename on Linux doesn't treat '\\' as a separator, so we normalize
    // backslashes to forward slashes before basename
    const result = buildOjsPublicUrl(
      "https://example.com",
      "public/journals/10",
      "..\\..\\secret.png"
    )
    expect(result).toBe("https://example.com/public/journals/10/secret.png")
    expect(result).not.toContain("..")
    expect(result).not.toContain("%5C")
  })

  it("strips mixed forward/back slash traversal", () => {
    const result = buildOjsPublicUrl(
      "https://example.com",
      "public/site",
      "..\\..\\../etc\\passwd"
    )
    expect(result).toBe("https://example.com/public/site/passwd")
  })

  it("does not double-encode an already-clean filename", () => {
    const result = buildOjsPublicUrl("https://example.com", "public/journals/1", "cover.png")
    expect(result).toBe("https://example.com/public/journals/1/cover.png")
  })
})

// ─── buildOjsAssetUrl ─────────────────────────────────────────────────────────

describe("buildOjsAssetUrl", () => {
  const originalEnv = process.env.OJS_BASE_URL

  beforeEach(() => {
    process.env.OJS_BASE_URL = "https://submitmanager.com"
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OJS_BASE_URL
    } else {
      process.env.OJS_BASE_URL = originalEnv
    }
  })

  it("returns null for null filename", () => {
    expect(buildOjsAssetUrl("public/journals/10", null)).toBeNull()
  })

  it("returns null for undefined filename", () => {
    expect(buildOjsAssetUrl("public/journals/10", undefined)).toBeNull()
  })

  it("returns null for empty filename", () => {
    expect(buildOjsAssetUrl("public/journals/10", "")).toBeNull()
  })

  it("builds a correct cover image URL", () => {
    expect(buildOjsAssetUrl("public/journals/10", "cover.png")).toBe(
      "https://submitmanager.com/public/journals/10/cover.png"
    )
  })

  it("builds a correct profile image URL", () => {
    expect(buildOjsAssetUrl("public/site/profileImages", "photo.jpg")).toBe(
      "https://submitmanager.com/public/site/profileImages/photo.jpg"
    )
  })

  it("strips /ojs from OJS_BASE_URL that includes the subpath", () => {
    process.env.OJS_BASE_URL = "https://submitmanager.com/ojs"
    expect(buildOjsAssetUrl("public/journals/10", "cover.png")).toBe(
      "https://submitmanager.com/public/journals/10/cover.png"
    )
  })

  it("normalizes /ojs/public/ if it somehow appears in the final URL", () => {
    // Even if the env var contains /ojs, the output must not contain /ojs/public/
    process.env.OJS_BASE_URL = "https://submitmanager.com/ojs"
    const url = buildOjsAssetUrl("public/journals/5", "homepageImage_en.png")
    expect(url).not.toContain("/ojs/public/")
    expect(url).toContain("/public/journals/5/homepageImage_en.png")
  })
})

// ─── Regression guard: /ojs/public/ rewrite ──────────────────────────────────

describe("normalizeOjsAssetUrl", () => {
  it("rewrites legacy /ojs/public/ URLs to /public/", () => {
    const legacy = "https://submitmanager.com/ojs/public/journals/10/cover.png"
    expect(normalizeOjsAssetUrl(legacy)).toBe(
      "https://submitmanager.com/public/journals/10/cover.png"
    )
  })

  it("is case-insensitive for /OJS/Public/", () => {
    const mixed = "https://submitmanager.com/OJS/Public/journals/10/cover.png"
    expect(normalizeOjsAssetUrl(mixed)).toBe(
      "https://submitmanager.com/public/journals/10/cover.png"
    )
  })

  it("passes through already-correct URLs unchanged", () => {
    const correct = "https://submitmanager.com/public/journals/10/cover.png"
    expect(normalizeOjsAssetUrl(correct)).toBe(correct)
  })

  it("returns null for null input", () => {
    expect(normalizeOjsAssetUrl(null)).toBeNull()
  })

  it("returns null for undefined input", () => {
    expect(normalizeOjsAssetUrl(undefined)).toBeNull()
  })
})

// ─── Truth fixtures (#148, #239) ──────────────────────────────────────────────
// Real OJS 3.5 setting shapes. If one of these fails, the parser is wrong —
// do not change the fixture's `expected` to make it pass.

import imageSettings from "../fixtures/ojs-image-settings.json"

describe("parseOjsFilename against real OJS image settings", () => {
  it.each(imageSettings.cases.map((c) => [c.source, c.raw, c.expected]))(
    "%s → the file OJS stored",
    (_source, raw, expected) => {
      expect(parseOjsFilename(raw)).toBe(expected)
    }
  )

  it("never falls back to `name` when the row has an unusable uploadName (name is never on disk)", () => {
    expect(parseOjsFilename('{"name":"Journal Cover.png","uploadName":"homepageImage_en"}')).toBeNull()
    expect(parseOjsFilename('{"en":{"name":"Cover.png","uploadName":""},"fr":{"name":"Couverture.png"}}')).toBeNull()
  })

  it("accepts SVG covers stored by OJS 3.4+", () => {
    expect(parseOjsFilename('{"name":"Logo.svg","uploadName":"pageHeaderLogoImage_en.svg"}')).toBe("pageHeaderLogoImage_en.svg")
  })

  it("never returns the human `name` for a production cover row (the 2026-10-26 regression)", () => {
    for (const c of imageSettings.cases) {
      const human = /"name":"([^"]+)"/.exec(c.raw)?.[1]
      if (human && human !== c.expected) expect(parseOjsFilename(c.raw)).not.toBe(human)
    }
  })
})
