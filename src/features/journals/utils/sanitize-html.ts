import DOMPurify, { type Config } from "dompurify"

type SanitizerFn = (html: string, options?: Config) => string

function getSanitizer(): SanitizerFn | null {
  const directObj = DOMPurify as unknown as { sanitize?: SanitizerFn }
  if (typeof directObj.sanitize === "function") {
    return directObj.sanitize.bind(directObj)
  }
  const defaultObj = (DOMPurify as unknown as { default?: { sanitize?: SanitizerFn } }).default
  if (typeof defaultObj?.sanitize === "function") {
    return defaultObj.sanitize.bind(defaultObj)
  }
  if (typeof window !== "undefined" && typeof DOMPurify === "function") {
    const factory = DOMPurify as unknown as (win: Window) => { sanitize: SanitizerFn }
    const instance = factory(window)
    return instance.sanitize.bind(instance)
  }
  return null
}

function sanitize(html: string, options: Config): string {
  const sanitizer = getSanitizer()
  if (sanitizer) {
    return sanitizer(html, options)
  }
  return html
}

/**
 * Citation preview: only bare <i> emphasis survives. Tags are stripped first so the
 * server render (no DOMPurify there) and the browser render give the same markup.
 */
export function sanitizeCitationHtml(html: string): string {
  const stripped = html.replace(/<(?!\/?i>)[^>]*>/gi, "")
  return sanitize(stripped, { ALLOWED_TAGS: ["i"], ALLOWED_ATTR: [] })
}

/**
 * Strict sanitizer for simple structured content (descriptions, author guidelines).
 */
export function sanitizeContent(html: string | null | undefined): string {
  if (!html) return ""
  return sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li", "h3", "h4"],
    ALLOWED_ATTR: [],
  })
}

/**
 * Richer sanitizer for OJS-sourced fee and about content, which may include tables,
 * links and inline formatting. The server already runs a strict sanitize pass —
 * this is defense in depth for the browser-side render.
 */
export function sanitizeRichContent(html: string | null | undefined): string {
  if (!html) return ""
  return sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "ul",
      "ol",
      "li",
      "a",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "blockquote",
      "span",
      "div",
      "table",
      "tbody",
      "tr",
      "td",
      "th",
      "thead",
      "hr",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  })
}
