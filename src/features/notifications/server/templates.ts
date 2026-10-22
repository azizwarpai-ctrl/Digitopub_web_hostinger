import type { PrismaClient } from "@prisma/client"

import { EMAIL_STYLES, type EmailStyle } from "./email-styles"
import { TEMPLATE_SET, buildTemplateSet, type TemplateDefinition } from "./template-set"

/**
 * Notification email templates referenced by campaigns. Campaigns need a real
 * `email_templates` row (FK), so the shipped version (template-set.ts, #203)
 * is created on first use if the seed has not run. Admin edits are never
 * overwritten here; "Reset to default" and `seed --force` restore them, in
 * the active email style when the caller passes it.
 */

export const NOTIFICATION_TEMPLATE_KEYS = {
    importInvitation: "notify_import_invitation",
    subscriptionConfirm: "notify_subscription_confirm",
    welcome: "notify_welcome",
    preferencesUpdated: "notify_preferences_updated",
    newIssue: "notify_new_issue",
    weeklyDigest: "notify_weekly_digest",
    dailyDigest: "notify_daily_digest",
    customMessage: "notify_custom_message",
} as const

export type TemplateKey = (typeof NOTIFICATION_TEMPLATE_KEYS)[keyof typeof NOTIFICATION_TEMPLATE_KEYS]

const DEFAULTS = TEMPLATE_SET as Record<TemplateKey, TemplateDefinition>

const setCache = new Map<string, Record<string, TemplateDefinition>>([["classic", TEMPLATE_SET]])

/** The shipped set drawn in `style` (memoised: the set is pure). */
export function templateSetFor(style: EmailStyle = EMAIL_STYLES.classic): Record<string, TemplateDefinition> {
    let set = setCache.get(style.key)
    if (!set) setCache.set(style.key, (set = buildTemplateSet(style)))
    return set
}

/** Returns the template id, creating the shipped template if it does not exist. */
export async function ensureNotificationTemplate(
    db: Pick<PrismaClient, "emailTemplate">,
    key: TemplateKey,
    style?: EmailStyle,
): Promise<bigint> {
    const row = await db.emailTemplate.upsert({
        where: { name: key },
        update: {},
        create: { name: key, category: "notification", is_active: true, ...(style ? templateSetFor(style)[key] : DEFAULTS[key]) },
        select: { id: true },
    })
    return row.id
}

export type TemplateDefaults = TemplateDefinition

/** The shipped version of a notification template in `style`, or null for other names. */
export function getDefaultTemplate(name: string, style?: EmailStyle): TemplateDefaults | null {
    return templateSetFor(style)[name] ?? null
}

/**
 * Seeds the full notification template set. Create-only by default, so an
 * admin's edits survive re-runs; `force` restores every shipped version.
 */
export async function seedNotificationTemplates(
    db: Pick<PrismaClient, "emailTemplate">,
    opts: { force?: boolean; style?: EmailStyle } = {},
): Promise<{ created: string[]; restored: string[]; kept: string[] }> {
    const result = { created: [] as string[], restored: [] as string[], kept: [] as string[] }
    for (const [name, t] of Object.entries(templateSetFor(opts.style))) {
        const existing = await db.emailTemplate.findUnique({ where: { name }, select: { id: true } })
        if (!existing) {
            await db.emailTemplate.create({ data: { name, category: "notification", is_active: true, ...t } })
            result.created.push(name)
        } else if (opts.force) {
            await db.emailTemplate.update({ where: { name }, data: { category: "notification", ...t } })
            result.restored.push(name)
        } else {
            result.kept.push(name)
        }
    }
    return result
}
