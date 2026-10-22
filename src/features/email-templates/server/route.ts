import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { requireAdmin } from "@/src/lib/auth-middleware"
import { parsePagination, paginatedResponse } from "@/src/lib/pagination"
import { serializeRecord, serializeMany } from "@/src/lib/serialize"
import { prisma } from "@/src/lib/db/config"
import { Prisma } from "@prisma/client"
import { renderHtmlTemplate, renderTemplate, extractVariables, validateVariables } from "@/src/lib/email/renderer"
import { RAW_BLOCK_VARIABLES } from "@/src/features/notifications/server/render-blocks"
import { sampleVariables } from "@/src/features/notifications/server/sample-data"
import { getDefaultTemplate } from "@/src/features/notifications/server/templates"
import { sendEmail, getEmailServiceStatus } from "@/src/lib/email/service"
import {
  emailTemplateCreateSchema,
  emailTemplateUpdateSchema,
  emailTemplateIdParamSchema,
  emailTemplatePreviewSchema,
  emailTemplateSendTestSchema,
} from "@/src/features/email-templates/schemas/email-template-schema"

const app = new Hono()

/** Notification templates may insert server-built blocks raw ({{{toc_html}}}); nothing else can. */
const rawFor = (t: { category: string }) => (t.category === "notification" ? RAW_BLOCK_VARIABLES : [])

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  subject: true,
  html_content: true,
  text_content: true,
  variables: true,
  description: true,
  is_active: true,
  category: true,
  created_at: true,
  updated_at: true,
} as const

// GET /email-templates - List all templates (admin only, paginated)
app.get("/", requireAdmin, async (c) => {
  try {
    const pagination = parsePagination(c)
    const activeFilter = c.req.query("active")
    const categoryFilter = c.req.query("category")
    const where: Prisma.EmailTemplateWhereInput = {}
    if (activeFilter !== undefined) {
      if (activeFilter === "true" || activeFilter === "false") {
        where.is_active = activeFilter === "true"
      } else {
        return c.json({ success: false, error: "Invalid active value. Use 'true' or 'false'." }, 400)
      }
    }
    if (categoryFilter !== undefined) {
      if (categoryFilter === "transactional" || categoryFilter === "notification") {
        where.category = categoryFilter
      } else {
        return c.json({ success: false, error: "Invalid category. Use 'transactional' or 'notification'." }, 400)
      }
    }

    const [templates, total] = await Promise.all([
      prisma.emailTemplate.findMany({
        where,
        select: TEMPLATE_SELECT,
        orderBy: { updated_at: "desc" },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      prisma.emailTemplate.count({ where }),
    ])

    return c.json(paginatedResponse(serializeMany(templates), total, pagination), 200)
  } catch (error) {
    console.error("Error fetching email templates:", error)
    return c.json({ success: false, error: "Failed to fetch email templates" }, 500)
  }
})

// GET /email-templates/status - Check email service status (admin only)
app.get("/status", requireAdmin, async (c) => {
  try {
    const status = getEmailServiceStatus()
    return c.json({ success: true, data: status }, 200)
  } catch (error) {
    console.error("Error checking email status:", error)
    return c.json({ success: false, error: "Failed to check email status" }, 500)
  }
})

// GET /email-templates/logs - List email logs (admin only, paginated)
app.get("/logs", requireAdmin, async (c) => {
  try {
    const pagination = parsePagination(c)
    const statusFilter = c.req.query("status")
    
    let where: Prisma.EmailLogWhereInput = {}
    if (statusFilter && statusFilter !== "all") {
      if (!["pending", "sent", "failed"].includes(statusFilter)) {
        return c.json({
          success: false,
          error: "Invalid status filter. Allowed values: pending, sent, failed"
        }, 400)
      }
      where.status = statusFilter
    }

    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: pagination.limit,
        skip: pagination.offset,
        include: {
          template: {
            select: { name: true }
          }
        }
      }),
      prisma.emailLog.count({ where }),
    ])

    return c.json(paginatedResponse(serializeMany(logs), total, pagination), 200)
  } catch (error) {
    console.error("Error fetching email logs:", error)
    return c.json({ success: false, error: "Failed to fetch email logs" }, 500)
  }
})

// GET /email-templates/:id - Get single template (admin only)
app.get("/:id", requireAdmin, zValidator("param", emailTemplateIdParamSchema), async (c) => {
  try {
    const { id } = c.req.valid("param")

    const template = await prisma.emailTemplate.findUnique({
      where: { id: BigInt(id) },
      select: TEMPLATE_SELECT,
    })

    if (!template) {
      return c.json({ success: false, error: "Template not found" }, 404)
    }

    return c.json({ success: true, data: serializeRecord(template) }, 200)
  } catch (error) {
    console.error("Error fetching email template:", error)
    return c.json({ success: false, error: "Failed to fetch email template" }, 500)
  }
})

// POST /email-templates - Create template (admin only)
app.post("/", requireAdmin, zValidator("json", emailTemplateCreateSchema), async (c) => {
  try {
    const data = c.req.valid("json")

    // Check for duplicate name
    const existing = await prisma.emailTemplate.findUnique({
      where: { name: data.name },
      select: { id: true },
    })

    if (existing) {
      return c.json({ success: false, error: "A template with this name already exists" }, 409)
    }

    // Auto-extract variables from content fields if not provided
    const detectedVariables = Array.from(new Set([
      ...extractVariables(data.subject),
      ...extractVariables(data.html_content),
      ...extractVariables(data.text_content || ""),
    ]))

    const variables = data.variables && data.variables.length > 0
      ? data.variables
      : detectedVariables

    try {
      const template = await prisma.emailTemplate.create({
        data: {
          name: data.name,
          subject: data.subject,
          ...(data.category ? { category: data.category } : {}),
          html_content: data.html_content,
          text_content: data.text_content || null,
          variables: variables,
          description: data.description || null,
          is_active: data.is_active,
        },
        select: TEMPLATE_SELECT,
      })

      return c.json(
        { success: true, data: serializeRecord(template), message: "Template created successfully" },
        201
      )
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return c.json({ success: false, error: "A template with this name already exists" }, 409)
      }
      throw error
    }
  } catch (error) {
    console.error("Error creating email template:", error)
    return c.json({ success: false, error: "Failed to create email template" }, 500)
  }
})

// PATCH /email-templates/:id - Update template (admin only)
app.patch(
  "/:id",
  requireAdmin,
  zValidator("param", emailTemplateIdParamSchema),
  zValidator("json", emailTemplateUpdateSchema),
  async (c) => {
    try {
      const { id } = c.req.valid("param")
      const data = c.req.valid("json")

      const existing = await prisma.emailTemplate.findUnique({
        where: { id: BigInt(id) },
        select: TEMPLATE_SELECT,
      })

      if (!existing) {
        return c.json({ success: false, error: "Template not found" }, 404)
      }

      // If name is changing, check uniqueness
      if (data.name) {
        const nameConflict = await prisma.emailTemplate.findFirst({
          where: { name: data.name, id: { not: BigInt(id) } },
          select: { id: true },
        })
        if (nameConflict) {
          return c.json({ success: false, error: "A template with this name already exists" }, 409)
        }
      }

      // Build update object — only include provided fields
      const updateData: Record<string, any> = {}
      if (data.name !== undefined) updateData.name = data.name
      if (data.subject !== undefined) updateData.subject = data.subject
      if (data.category !== undefined) updateData.category = data.category
      if (data.text_content !== undefined) updateData.text_content = data.text_content
      
      if (data.html_content !== undefined || data.subject !== undefined || data.text_content !== undefined) {
        // Use provided values or existing ones for variable extraction
        const subjectForExtraction = data.subject ?? existing.subject
        const htmlForExtraction = data.html_content ?? existing.html_content
        const textForExtraction = data.text_content ?? (existing.text_content || "")
        
        const detectedVariables = Array.from(new Set([
          ...extractVariables(subjectForExtraction),
          ...extractVariables(htmlForExtraction),
          ...extractVariables(textForExtraction),
        ]))
        
        if (data.variables === undefined) {
          updateData.variables = detectedVariables
        }
      }
      
      if (data.variables !== undefined) {
        updateData.variables = data.variables
      }
      
      if (data.description !== undefined) updateData.description = data.description
      if (data.is_active !== undefined) updateData.is_active = data.is_active

      try {
        const updated = await prisma.emailTemplate.update({
          where: { id: BigInt(id) },
          data: updateData,
          select: TEMPLATE_SELECT,
        })

        return c.json(
          { success: true, data: serializeRecord(updated), message: "Template updated successfully" },
          200
        )
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return c.json({ success: false, error: "A template with this name already exists" }, 409)
        }
        throw error
      }
    } catch (error) {
      console.error("Error updating email template:", error)
      return c.json({ success: false, error: "Failed to update email template" }, 500)
    }
  }
)

// DELETE /email-templates/:id - Delete template (admin only)
app.delete("/:id", requireAdmin, zValidator("param", emailTemplateIdParamSchema), async (c) => {
  try {
    const { id } = c.req.valid("param")

    const existing = await prisma.emailTemplate.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    })

    if (!existing) {
      return c.json({ success: false, error: "Template not found" }, 404)
    }

    await prisma.emailTemplate.delete({
      where: { id: BigInt(id) },
    })

    return c.json({ success: true, message: "Template deleted successfully" }, 200)
  } catch (error) {
    console.error("Error deleting email template:", error)
    return c.json({ success: false, error: "Failed to delete email template" }, 500)
  }
})

// POST /email-templates/:id/preview - Preview rendered template (admin only)
app.post(
  "/:id/preview",
  requireAdmin,
  zValidator("param", emailTemplateIdParamSchema),
  zValidator("json", emailTemplatePreviewSchema),
  async (c) => {
    try {
      const { id } = c.req.valid("param")
      const { variables } = c.req.valid("json") as { variables: Record<string, string> }

      const template = await prisma.emailTemplate.findUnique({
        where: { id: BigInt(id) },
        select: TEMPLATE_SELECT,
      })

      if (!template) {
        return c.json({ success: false, error: "Template not found" }, 404)
      }

      const combinedContentForValidation = [
        template.subject,
        template.html_content,
        template.text_content || "",
      ].join("\n")

      const missingVars = validateVariables(combinedContentForValidation, variables)

      const renderedSubject = renderTemplate(template.subject, variables)
      const renderedHtml = renderHtmlTemplate(template.html_content, variables, rawFor(template))
      const renderedText = template.text_content
        ? renderTemplate(template.text_content, variables)
        : null

      return c.json({
        success: true,
        data: {
          subject: renderedSubject,
          html: renderedHtml,
          text: renderedText,
          missingVariables: missingVars,
        },
      }, 200)
    } catch (error) {
      console.error("Error previewing template:", error)
      return c.json({ success: false, error: "Failed to preview template" }, 500)
    }
  }
)

// POST /email-templates/:id/send-test - Send test email (admin only)
app.post(
  "/:id/send-test",
  requireAdmin,
  zValidator("param", emailTemplateIdParamSchema),
  zValidator("json", emailTemplateSendTestSchema),
  async (c) => {
    try {
      const { id } = c.req.valid("param")
      const { to, variables } = c.req.valid("json") as { to: string; variables: Record<string, string> }

      const template = await prisma.emailTemplate.findUnique({
        where: { id: BigInt(id) },
        select: TEMPLATE_SELECT,
      })

      if (!template) {
        return c.json({ success: false, error: "Template not found" }, 404)
      }

      // Check for unresolved required variables before sending
      const combinedContentForValidation = [
        template.subject,
        template.html_content,
        template.text_content || "",
      ].join("\n")

      const missingVars = validateVariables(combinedContentForValidation, variables)
      if (missingVars.length > 0) {
        return c.json({ 
          success: false, 
          error: "Required variables are missing", 
          missingVariables: missingVars 
        }, 400)
      }

      // Render template
      const renderedSubject = renderTemplate(`[TEST] ${template.subject}`, variables)
      const renderedHtml = renderHtmlTemplate(template.html_content, variables, rawFor(template))
      const renderedText = template.text_content
        ? renderTemplate(template.text_content, variables)
        : undefined

      // Log attempt
      const log = await prisma.emailLog.create({
        data: {
          template_id: template.id,
          to_email: to,
          subject: renderedSubject,
          status: "pending",
        },
      })

      // Send
      const result = await sendEmail({
        to,
        subject: renderedSubject,
        html: renderedHtml,
        text: renderedText,
      })

      // Update log
      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: result.success ? "sent" : "failed",
          error_message: result.error || null,
          sent_at: result.success ? new Date() : null,
        },
      })

      if (result.success) {
        return c.json({ success: true, message: `Test email sent to ${to}` }, 200)
      } else {
        return c.json({ success: false, error: result.error || "Failed to send test email" }, 500)
      }
    } catch (error) {
      console.error("Error sending test email:", error)
      return c.json({ success: false, error: "Failed to send test email" }, 500)
    }
  }
)

// GET /email-templates/:id/sample-variables - Realistic fixture values for previews (admin only)
app.get("/:id/sample-variables", requireAdmin, zValidator("param", emailTemplateIdParamSchema), async (c) => {
  const template = await prisma.emailTemplate.findUnique({
    where: { id: BigInt(c.req.valid("param").id) },
    select: { name: true, variables: true, category: true },
  })
  if (!template) return c.json({ success: false, error: "Template not found" }, 404)
  return c.json({
    success: true,
    data: {
      variables: sampleVariables(template.name),
      allowed_variables: Array.isArray(template.variables) ? template.variables : [],
      raw_variables: rawFor(template),
    },
  }, 200)
})

// POST /email-templates/:id/reset - Restore a shipped notification template (admin only)
app.post("/:id/reset", requireAdmin, zValidator("param", emailTemplateIdParamSchema), async (c) => {
  const id = BigInt(c.req.valid("param").id)
  const template = await prisma.emailTemplate.findUnique({ where: { id }, select: { name: true } })
  if (!template) return c.json({ success: false, error: "Template not found" }, 404)
  const defaults = getDefaultTemplate(template.name)
  if (!defaults) return c.json({ success: false, error: "This template has no shipped default" }, 409)
  const updated = await prisma.emailTemplate.update({
    where: { id },
    data: { ...defaults, category: "notification", is_active: true },
    select: TEMPLATE_SELECT,
  })
  return c.json({ success: true, data: serializeRecord(updated), message: "Template restored to its default" }, 200)
})

export { app as emailTemplateRouter }
