/**
 * Email Service — Central email sending API.
 *
 * Responsibilities:
 * - Resolve templates by name
 * - Inject variables and render
 * - Send via SMTP transport
 * - Log sending activity to the EmailLog table
 */

import { prisma } from "@/src/lib/db/config"
import { renderHtmlTemplate, renderTemplate, validateVariables } from "./renderer"
import { getTransporter, getFromAddress, isSmtpConfigured } from "./transport"

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export interface SendTemplateEmailOptions {
  templateName: string
  to: string
  variables: Record<string, string>
  /** Variables allowed as raw HTML via {{{name}}} (server-built blocks only). */
  rawAllowed?: readonly string[]
}

export interface PreviewResult {
  subject: string
  html: string
  text: string | null
}

/**
 * Send a raw email (no template).
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const transport = getTransporter()

  if (!transport) {
    console.warn("[EMAIL] SMTP not configured — email not sent:", options.subject)
    return { success: false, error: "SMTP not configured" }
  }

  try {
    await transport.sendMail({
      from: getFromAddress(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })

    return { success: true }
  } catch (error: any) {
    console.error("[EMAIL] Send failed:", error)
    return { success: false, error: error.message || "Unknown send error" }
  }
}

/**
 * Send an email using a stored template.
 * Resolves the template by name, validates variables, renders, sends, and logs.
 */
export async function sendTemplateEmail(
  options: SendTemplateEmailOptions
): Promise<{ success: boolean; error?: string }> {
  // Resolve template
  const template = await prisma.emailTemplate.findUnique({
    where: { name: options.templateName },
  })

  if (!template) {
    return { success: false, error: `Template "${options.templateName}" not found` }
  }

  if (!template.is_active) {
    return { success: false, error: `Template "${options.templateName}" is inactive` }
  }

  // Validate variables (check subject, html and text fields)
  const combinedContentForValidation = [
    template.subject,
    template.html_content,
    template.text_content || "",
  ].join("\n")

  const missingVars = validateVariables(combinedContentForValidation, options.variables)
  if (missingVars.length > 0) {
    return { success: false, error: `Missing template variables: ${missingVars.join(", ")}` }
  }

  // Render
  const renderedSubject = renderTemplate(template.subject, options.variables)
  // HTML is escaped; subject and text are plain text and are not.
  const renderedHtml = renderHtmlTemplate(template.html_content, options.variables, options.rawAllowed)
  const renderedText = template.text_content
    ? renderTemplate(template.text_content, options.variables)
    : undefined

  // Log the attempt
  const log = await prisma.emailLog.create({
    data: {
      template_id: template.id,
      to_email: options.to,
      subject: renderedSubject,
      status: "pending",
    },
  })

  // Send
  const result = await sendEmail({
    to: options.to,
    subject: renderedSubject,
    html: renderedHtml,
    text: renderedText,
  })

  // Update log (best effort - don't let log update failure fail the whole operation)
  try {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: result.success ? "sent" : "failed",
        error_message: result.error || null,
        sent_at: result.success ? new Date() : null,
      },
    })
  } catch (logError) {
    console.warn(`[EMAIL] Failed to update log ${log.id}:`, logError)
  }

  return result
}

/**
 * Preview a template with provided variables (no sending).
 */
export async function previewTemplate(
  templateName: string,
  variables: Record<string, string>
): Promise<{ success: boolean; data?: PreviewResult; error?: string }> {
  const template = await prisma.emailTemplate.findUnique({
    where: { name: templateName },
  })

  if (!template) {
    return { success: false, error: `Template "${templateName}" not found` }
  }

  const renderedSubject = renderTemplate(template.subject, variables)
  const renderedHtml = renderHtmlTemplate(template.html_content, variables)
  const renderedText = template.text_content
    ? renderTemplate(template.text_content, variables)
    : null

  return {
    success: true,
    data: {
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
    },
  }
}

/**
 * Check if the email service is operational.
 */
export function getEmailServiceStatus(): {
  smtpConfigured: boolean
  provider: string
} {
  return {
    smtpConfigured: isSmtpConfigured(),
    provider: process.env.SMTP_HOST || "not configured",
  }
}
