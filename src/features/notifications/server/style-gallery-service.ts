/**
 * Email style gallery: preview every ready-made style with sample content,
 * and apply one to the whole notification set. Applying re-generates each
 * template's HTML from the shipped body in the new style; subjects and the
 * plain-text parts are left as the admin wrote them. Templates whose HTML an
 * admin has edited are skipped unless the caller asks to replace them.
 */

import { Prisma } from "@prisma/client"

import { prisma } from "@/src/lib/db/config"
import { extractVariables, renderHtmlTemplate, renderTemplate } from "@/src/lib/email/renderer"

import { SETTINGS_KEY, getSettings } from "./admin-config-service"
import { EMAIL_STYLES, EMAIL_STYLE_KEYS, getEmailStyle, type EmailStyleKey } from "./email-styles"
import { RAW_BLOCK_VARIABLES } from "./render-blocks"
import { sampleVariables } from "./sample-data"
import { NOTIFICATION_TEMPLATE_KEYS, templateSetFor, type TemplateKey } from "./templates"

export const STYLE_TEMPLATE_NAMES = Object.values(NOTIFICATION_TEMPLATE_KEYS) as TemplateKey[]

/** Notification templates whose stored HTML differs from the shipped HTML of the active style. */
async function findCustomised(activeKey: EmailStyleKey): Promise<string[]> {
    const shipped = templateSetFor(EMAIL_STYLES[activeKey])
    const rows = await prisma.emailTemplate.findMany({
        where: { name: { in: STYLE_TEMPLATE_NAMES } },
        select: { name: true, html_content: true },
    })
    return rows.filter((r) => r.html_content !== shipped[r.name]?.html_content).map((r) => r.name)
}

export async function listStyles() {
    const active = (await getSettings()).email_style
    return {
        active,
        styles: EMAIL_STYLE_KEYS.map((key) => ({ key, name: EMAIL_STYLES[key].name, description: EMAIL_STYLES[key].description })),
        customised: await findCustomised(active),
    }
}

/** The shipped template `templateName` drawn in `styleKey`, rendered with sample data. */
export async function previewStyle(styleKey: EmailStyleKey, templateName: TemplateKey): Promise<{ subject: string; html: string }> {
    const style = EMAIL_STYLES[styleKey]
    const t = templateSetFor(style)[templateName]
    const vars = sampleVariables(templateName, style)
    const { publisher_address } = await getSettings()
    if (publisher_address.trim()) vars.publisher_address = publisher_address
    return {
        subject: renderTemplate(t.subject, vars).replace(/[\r\n]+/g, " ").trim(),
        html: renderHtmlTemplate(t.html_content, vars, RAW_BLOCK_VARIABLES),
    }
}

/** Declared variables of an edited template after its HTML is replaced (the admin's subject and text still count). */
function variablesFor(shipped: string[], subject: string, text: string | null): string[] {
    return [...new Set([...shipped, ...extractVariables(subject), ...extractVariables(text ?? "")])]
}

export async function applyStyle(
    styleKey: EmailStyleKey,
    opts: { overwriteCustomised?: boolean } = {},
    adminId: bigint,
): Promise<{ applied: string[]; skipped: string[] }> {
    const settings = await getSettings()
    const customised = new Set(opts.overwriteCustomised ? [] : await findCustomised(settings.email_style))
    const target = templateSetFor(getEmailStyle(styleKey))
    const rows = await prisma.emailTemplate.findMany({
        where: { name: { in: STYLE_TEMPLATE_NAMES } },
        select: { name: true, subject: true, text_content: true },
    })

    const applied: string[] = []
    const skipped: string[] = []
    const writes: Prisma.PrismaPromise<unknown>[] = []
    for (const row of rows) {
        if (customised.has(row.name)) {
            skipped.push(row.name)
            continue
        }
        const shipped = target[row.name]
        writes.push(prisma.emailTemplate.update({
            where: { name: row.name },
            data: {
                html_content: shipped.html_content,
                variables: variablesFor(shipped.variables, row.subject, row.text_content),
            },
        }))
        applied.push(row.name)
    }

    const next = { ...settings, email_style: styleKey }
    writes.push(prisma.systemSetting.upsert({
        where: { setting_key: SETTINGS_KEY },
        update: { setting_value: next as unknown as Prisma.InputJsonValue, updated_by: adminId },
        create: {
            setting_key: SETTINGS_KEY,
            setting_value: next as unknown as Prisma.InputJsonValue,
            description: "Publication notification settings",
            updated_by: adminId,
        },
    }))
    await prisma.$transaction(writes)
    return { applied, skipped }
}
