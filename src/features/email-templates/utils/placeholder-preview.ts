/**
 * The quick "Preview" of the new and edit template forms (#248): each
 * {{variable}} is shown highlighted in the HTML and in brackets in the
 * subject. Variable names come from extractAllVariables (\w+ only), so
 * they are safe to use in a RegExp. The result is displayed sanitised in
 * a sandboxed iframe (email-content-card.tsx).
 */
export function buildPlaceholderPreview(
  html: string | undefined,
  subject: string | undefined,
  variables: readonly string[],
): { html: string; subject: string } {
  let previewContent = html || ""
  let previewSub = subject || ""
  variables.forEach((v) => {
    const sampleValue = `<strong style="color:#3b82f6">[${v}]</strong>`
    previewContent = previewContent.replace(new RegExp(`\\{\\{${v}\\}\\}`, "g"), sampleValue)
    previewSub = previewSub.replace(new RegExp(`\\{\\{${v}\\}\\}`, "g"), `[${v}]`)
  })
  return { html: previewContent, subject: previewSub }
}
