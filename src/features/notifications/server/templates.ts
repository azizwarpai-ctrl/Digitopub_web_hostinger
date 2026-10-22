import type { PrismaClient } from "@prisma/client"

/**
 * Notification email templates referenced by campaigns. Campaigns need a real
 * `email_templates` row (FK), so a minimal placeholder is created on first use.
 * The full academic template set (Phase 7, #203) replaces these bodies.
 */

export const NOTIFICATION_TEMPLATE_KEYS = {
    importInvitation: "notify_import_invitation",
} as const

type TemplateKey = (typeof NOTIFICATION_TEMPLATE_KEYS)[keyof typeof NOTIFICATION_TEMPLATE_KEYS]

const PLACEHOLDERS: Record<TemplateKey, {
    subject: string
    description: string
    variables: string[]
    html_content: string
    text_content: string
}> = {
    notify_import_invitation: {
        subject: "Invitation: publication alerts in {{primary_discipline}}",
        description: "Double opt-in invitation sent to imported contacts. Placeholder until the full template set is seeded.",
        variables: ["recipient_name", "primary_discipline", "inviter_org", "confirm_url", "expires_on", "site_name"],
        html_content: `<p>Dear {{recipient_name}},</p>
<p>{{inviter_org}} added your address to receive research publication alerts in {{primary_discipline}}.</p>
<p><a href="{{confirm_url}}">Yes, keep me informed</a></p>
<p>If you take no action, you will not receive further emails. This link expires on {{expires_on}}.</p>`,
        text_content: `Dear {{recipient_name}},

{{inviter_org}} added your address to receive research publication alerts in {{primary_discipline}}.

Confirm: {{confirm_url}}

If you take no action, you will not receive further emails. This link expires on {{expires_on}}.`,
    },
}

/** Returns the template id, creating the placeholder row if it does not exist. */
export async function ensureNotificationTemplate(
    db: Pick<PrismaClient, "emailTemplate">,
    key: TemplateKey,
): Promise<bigint> {
    const p = PLACEHOLDERS[key]
    const row = await db.emailTemplate.upsert({
        where: { name: key },
        update: {},
        create: { name: key, category: "notification", is_active: true, ...p },
        select: { id: true },
    })
    return row.id
}
