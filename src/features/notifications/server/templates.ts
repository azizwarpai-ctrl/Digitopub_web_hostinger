import type { PrismaClient } from "@prisma/client"

/**
 * Notification email templates referenced by campaigns. Campaigns need a real
 * `email_templates` row (FK), so a minimal placeholder is created on first use.
 * The full academic template set (Phase 7, #203) replaces these bodies.
 */

export const NOTIFICATION_TEMPLATE_KEYS = {
    importInvitation: "notify_import_invitation",
    subscriptionConfirm: "notify_subscription_confirm",
    welcome: "notify_welcome",
    preferencesUpdated: "notify_preferences_updated",
} as const

export type TemplateKey = (typeof NOTIFICATION_TEMPLATE_KEYS)[keyof typeof NOTIFICATION_TEMPLATE_KEYS]

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
    notify_subscription_confirm: {
        subject: "Confirm your publication alerts from {{site_name}}",
        description: "Double opt-in confirmation for public sign-ups. Placeholder until the full template set is seeded.",
        variables: ["recipient_name", "site_name", "confirm_url", "expires_on", "selected_journals", "selected_disciplines"],
        html_content: `<p>Dear {{recipient_name}},</p>
<p>Please confirm that you would like to receive publication alerts from {{site_name}}.</p>
<p>Journals: {{selected_journals}}<br>Disciplines: {{selected_disciplines}}</p>
<p><a href="{{confirm_url}}">Confirm subscription</a></p>
<p>This link expires on {{expires_on}}. If you did not request this, you can ignore this message; nothing further will be sent.</p>`,
        text_content: `Dear {{recipient_name}},

Please confirm that you would like to receive publication alerts from {{site_name}}.

Journals: {{selected_journals}}
Disciplines: {{selected_disciplines}}

Confirm: {{confirm_url}}

This link expires on {{expires_on}}. If you did not request this, you can ignore this message; nothing further will be sent.`,
    },
    notify_welcome: {
        subject: "Your {{site_name}} alerts are active",
        description: "Sent after a subscriber confirms. Placeholder until the full template set is seeded.",
        variables: ["recipient_name", "site_name", "manage_url", "unsubscribe_url"],
        html_content: `<p>Dear {{recipient_name}},</p>
<p>Your publication alerts from {{site_name}} are now active.</p>
<p><a href="{{manage_url}}">Manage preferences</a> · <a href="{{unsubscribe_url}}">Unsubscribe</a></p>`,
        text_content: `Dear {{recipient_name}},

Your publication alerts from {{site_name}} are now active.

Manage preferences: {{manage_url}}
Unsubscribe: {{unsubscribe_url}}`,
    },
    notify_preferences_updated: {
        subject: "Your alert preferences were updated",
        description: "Sent when a subscriber saves the preference centre. Placeholder until the full template set is seeded.",
        variables: ["recipient_name", "site_name", "manage_url", "unsubscribe_url"],
        html_content: `<p>Dear {{recipient_name}},</p>
<p>Your publication alert preferences at {{site_name}} were updated.</p>
<p><a href="{{manage_url}}">Review your preferences</a>. If you did not make this change, you can <a href="{{unsubscribe_url}}">unsubscribe</a>.</p>`,
        text_content: `Dear {{recipient_name}},

Your publication alert preferences at {{site_name}} were updated.

Review: {{manage_url}}
If you did not make this change, unsubscribe: {{unsubscribe_url}}`,
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
