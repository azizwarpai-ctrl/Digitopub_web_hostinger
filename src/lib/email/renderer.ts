/**
 * Email Template Renderer
 *
 * Simple Mustache-style {{variable}} replacement engine.
 * Designed to be safe and predictable — no logic, no conditionals.
 */

/**
 * Render a template string by replacing {{variable}} placeholders.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in variables ? variables[key] : match
  })
}

/** Escapes a value for HTML text and attribute contexts. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Render the HTML part of a template. `{{variable}}` is HTML-escaped.
 * `{{{variable}}}` inserts raw HTML, but only for names in `rawAllowed`
 * (server-built blocks such as a table of contents); any other triple-brace
 * variable is escaped like a normal one, so an edited template cannot opt a
 * user-supplied value out of escaping.
 */
export function renderHtmlTemplate(
  template: string,
  variables: Record<string, string>,
  rawAllowed: readonly string[] = []
): string {
  return template
    .replace(/\{\{\{(\w+)\}\}\}/g, (match, key: string) => {
      if (!(key in variables)) return match
      return rawAllowed.includes(key) ? variables[key] : escapeHtml(variables[key])
    })
    .replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      return key in variables ? escapeHtml(variables[key]) : match
    })
}

/**
 * Extract all unique variable names ({{key}}) from a template string.
 */
export function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g)
  if (!matches) return []

  const keys = matches.map((m) => m.replace(/\{\{|\}\}/g, ""))
  return [...new Set(keys)]
}

/**
 * Extract all unique variables across HTML content, subject, and optional text content.
 */
export function extractAllVariables(
  htmlContent: string,
  subject: string,
  textContent: string = ""
): string[] {
  const htmlVars = extractVariables(htmlContent)
  const subjectVars = extractVariables(subject)
  const textVars = extractVariables(textContent)
  return [...new Set([...htmlVars, ...subjectVars, ...textVars])]
}

/**
 * Validate that all required template variables have been provided.
 * Returns an array of missing variable names.
 */
export function validateVariables(
  template: string,
  provided: Record<string, string>
): string[] {
  const required = extractVariables(template)
  return required.filter((key) => !(key in provided))
}
