/**
 * The academic notification template set (#203). One shared structure: a
 * 600 px table layout with inline CSS (Outlook, Gmail, Apple Mail), a hidden
 * preheader, a dark-mode variant, and a compliant footer on every message
 * (why you receive it, manage preferences, unsubscribe, postal address,
 * privacy). Colours and fonts come from the active email style
 * (email-styles.ts); Classic, navy on ivory with Georgia headings, is the default.
 *
 * Tone: formal, concise, neutral; no exclamation marks or superlatives.
 * Values are inserted with {{name}} (HTML-escaped); only the server-built
 * blocks toc_html, articles_html and editor_note_html use {{{ }}}.
 */

import { EMAIL_STYLES, type EmailStyle } from "./email-styles"

export interface TemplateDefinition {
    subject: string
    description: string
    variables: string[]
    html_content: string
    text_content: string
}

const COMMON_VARIABLES = ["site_name", "site_url", "recipient_name", "manage_url", "unsubscribe_url", "publisher_address", "privacy_url", "preheader"]

interface LayoutOptions {
    /** Masthead line 1 (journal title or site wordmark) and optional line 2 (ISSN). */
    masthead: string
    mastheadSub?: string
    body: string
    /** Footer sentence explaining why this person receives the message. */
    reason: string
    /** Lifecycle emails before consent omit manage/unsubscribe (there is nothing to manage yet). */
    showManage?: boolean
}

function textFooter(reason: string, showManage = true): string {
    return `--
${reason}
${showManage ? "Manage preferences: {{manage_url}}\nUnsubscribe: {{unsubscribe_url}}\n" : ""}Privacy policy: {{privacy_url}}
{{publisher_address}}`
}

/** The building blocks of every template, drawn in one style. */
function styleKit(s: EmailStyle) {
    const C = s.colors
    const SANS = s.fonts.body

    /** Bulletproof table button with a visible plain-link fallback underneath. */
    const button = (label: string, hrefVar: string): string =>
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
  <tr><td class="btn" bgcolor="${C.accent}" style="border-radius:${s.buttonRadius}">
    <a href="{{${hrefVar}}}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:600;color:${C.buttonText};text-decoration:none;border-radius:${s.buttonRadius}">${label}</a>
  </td></tr>
</table>
<p style="margin:0 0 4px;font-family:${SANS};font-size:12px;line-height:1.5;color:${C.muted}">If the button does not work, copy this link into your browser:<br><a href="{{${hrefVar}}}" style="color:${C.accent};word-break:break-all">{{${hrefVar}}}</a></p>`

    const h1 = (text: string) =>
        `<h1 class="ink" style="margin:0 0 18px;font-family:${s.fonts.heading};font-size:24px;line-height:1.3;font-weight:${s.headingWeight};color:${C.ink}">${text}</h1>`
    const p = (text: string) =>
        `<p class="ink" style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.ink}">${text}</p>`
    const small = (text: string) =>
        `<p class="muted" style="margin:16px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted}">${text}</p>`

    function layout(o: LayoutOptions): string {
        const manage = o.showManage === false
            ? ""
            : `<a href="{{manage_url}}" style="color:${C.accent}">Manage preferences</a> &nbsp;·&nbsp; <a href="{{unsubscribe_url}}" style="color:${C.accent}">Unsubscribe</a> &nbsp;·&nbsp; `
        const d = s.dark
        return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{site_name}}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .bg { background:${d.bg} !important; }
    .card { background:${d.card} !important; border-color:${d.border} !important; }
    .ink { color:${d.ink} !important; }
    .muted { color:${d.muted} !important; }
    .mast { ${d.mast} }
    .btn { background:${d.button} !important; }
    a { color:${d.link} !important; }
  }
  @media (max-width:620px) { .wrap { width:100% !important; } .pad { padding:24px 20px !important; } }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">{{preheader}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:${C.page}">
  <tr><td align="center" style="padding:32px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="wrap" style="width:600px;max-width:600px">
      <tr><td class="mast" style="${s.mastCss}">
        ${o.masthead}${o.mastheadSub ? `<div class="muted" style="font-family:${SANS};font-size:12px;letter-spacing:.06em;color:${C.muted};margin-top:4px">${o.mastheadSub}</div>` : ""}
      </td></tr>
      <tr><td class="card pad" style="${s.cardCss}">
        ${o.body}
      </td></tr>
      <tr><td style="padding:22px 8px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted}" class="muted">
        ${o.reason}<br>
        ${manage}<a href="{{privacy_url}}" style="color:${C.accent}">Privacy policy</a><br>
        {{publisher_address}}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
    }

    const mastLink = (hrefVar: string, label: string) =>
        `<a href="{{${hrefVar}}}" style="color:${s.mastLink};text-decoration:none">${label}</a>`

    return { C, SANS, button, h1, p, small, layout, mastLink, SITE_MAST: mastLink("site_url", "{{site_name}}") }
}

/** The nine notification templates drawn in `style`. Wording and variables are the same in every style. */
export function buildTemplateSet(style: EmailStyle): Record<string, TemplateDefinition> {
    const { C, SANS, button, h1, p, small, layout, mastLink, SITE_MAST } = styleKit(style)
    return {
    notify_subscription_confirm: {
        subject: "Confirm your publication alerts from {{site_name}}",
        description: "Double opt-in confirmation for public and ORCID-account sign-ups.",
        variables: [...COMMON_VARIABLES, "confirm_url", "expires_on", "selected_journals", "selected_disciplines"],
        html_content: layout({
            masthead: SITE_MAST,
            showManage: false,
            reason: "You are receiving this message because this address was entered on the {{site_name}} alert sign-up form.",
            body: [
                h1("Please confirm your subscription"),
                p("Dear {{recipient_name}},"),
                p("Thank you for your interest in publication alerts from {{site_name}}. Please confirm that you wish to receive them for the following selection:"),
                `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;font-family:${SANS};font-size:15px;line-height:1.6">
  <tr><td class="muted" style="padding:2px 16px 2px 0;color:${C.muted};vertical-align:top">Journals</td><td class="ink" style="color:${C.ink}">{{selected_journals}}</td></tr>
  <tr><td class="muted" style="padding:2px 16px 2px 0;color:${C.muted};vertical-align:top">Disciplines</td><td class="ink" style="color:${C.ink}">{{selected_disciplines}}</td></tr>
</table>`,
                button("Confirm subscription", "confirm_url"),
                small("This link expires on {{expires_on}}. If you did not request this, you can ignore this message: nothing further will be sent."),
            ].join("\n"),
        }),
        text_content: `Dear {{recipient_name}},

Thank you for your interest in publication alerts from {{site_name}}. Please confirm that you wish to receive them.

Journals: {{selected_journals}}
Disciplines: {{selected_disciplines}}

Confirm subscription: {{confirm_url}}

This link expires on {{expires_on}}. If you did not request this, you can ignore this message: nothing further will be sent.

${textFooter("You are receiving this message because this address was entered on the {{site_name}} alert sign-up form.", false)}`,
    },

    notify_import_invitation: {
        subject: "Invitation: publication alerts in {{primary_discipline}}",
        description: "Double opt-in invitation for imported researcher contacts. No alerts are sent unless the recipient confirms.",
        variables: [...COMMON_VARIABLES, "confirm_url", "expires_on", "inviter_org", "primary_discipline"],
        html_content: layout({
            masthead: SITE_MAST,
            reason: "You are receiving this single invitation because {{inviter_org}} added your address to its list of researchers in {{primary_discipline}}.",
            body: [
                h1("An invitation to receive publication alerts"),
                p("Dear {{recipient_name}},"),
                p("{{inviter_org}} added your address to receive research publication alerts in <strong>{{primary_discipline}}</strong>. With your agreement, you would receive:"),
                `<ul class="ink" style="margin:0 0 16px;padding-left:20px;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.ink}">
  <li>a short notice when a new issue of a journal in your field is published, with its table of contents;</li>
  <li>a weekly digest of newly published articles in your areas of interest.</li>
</ul>`,
                p("You can change the frequency or your fields at any time, and every message includes a one-click unsubscribe link."),
                button("Yes, keep me informed", "confirm_url"),
                small("If you take no action, you will not receive further emails. This invitation expires on {{expires_on}}."),
            ].join("\n"),
        }),
        text_content: `Dear {{recipient_name}},

{{inviter_org}} added your address to receive research publication alerts in {{primary_discipline}}. With your agreement, you would receive:

- a short notice when a new issue of a journal in your field is published, with its table of contents;
- a weekly digest of newly published articles in your areas of interest.

You can change the frequency or your fields at any time, and every message includes a one-click unsubscribe link.

Yes, keep me informed: {{confirm_url}}

If you take no action, you will not receive further emails. This invitation expires on {{expires_on}}.

${textFooter("You are receiving this single invitation because {{inviter_org}} added your address to its list of researchers in {{primary_discipline}}.")}`,
    },

    notify_journal_invitation: {
        subject: "Stay connected with {{journal_title}} ({{journal_short}})",
        description: "Double opt-in invitation, in a journal's name, for a contact list assigned to that journal (#231). No alerts are sent unless the recipient confirms.",
        variables: [...COMMON_VARIABLES, "confirm_url", "expires_on", "salutation", "journal_title", "journal_short", "journal_scope_sentence", "journal_url"],
        html_content: layout({
            masthead: mastLink("journal_url", "{{journal_title}}"),
            reason: "You are receiving this one-time invitation because your address was included in a list of researchers whose work relates to the {{journal_title}}.",
            body: [
                p("Dear {{salutation}},"),
                p("We are pleased to invite you to stay connected with the <strong>{{journal_title}} ({{journal_short}})</strong>{{journal_scope_sentence}}."),
                p("With your permission, we would be delighted to send you occasional email alerts whenever new articles or journal issues are published, helping you stay informed about the latest research, clinical innovations, and developments in our specialty."),
                p("We also warmly encourage you to consider {{journal_short}} for publishing your future research, including original studies, clinical reports, reviews, and innovative techniques."),
                button("Explore the journal &amp; submit your research", "journal_url"),
                `<h2 class="ink" style="margin:32px 0 8px;font-family:${style.fonts.heading};font-size:19px;line-height:1.3;font-weight:${style.headingWeight};color:${C.ink}">Stay Connected with {{journal_short}}</h2>`,
                p("To receive complimentary publication alerts, simply confirm your interest below:"),
                button("Yes, keep me informed", "confirm_url"),
                small("Subscription is entirely optional. You may update your preferences or unsubscribe at any time. If you take no action, you will not receive further publication alerts. This invitation expires on {{expires_on}}."),
                `<p class="ink" style="margin:24px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.ink}">We look forward to sharing new scientific developments and welcoming your future contributions to the journal.</p>`,
            ].join("\n"),
        }),
        text_content: `Dear {{salutation}},

We are pleased to invite you to stay connected with the {{journal_title}} ({{journal_short}}){{journal_scope_sentence}}.

With your permission, we would be delighted to send you occasional email alerts whenever new articles or journal issues are published, helping you stay informed about the latest research, clinical innovations, and developments in our specialty.

We also warmly encourage you to consider {{journal_short}} for publishing your future research, including original studies, clinical reports, reviews, and innovative techniques.

Explore the journal and submit your research: {{journal_url}}

STAY CONNECTED WITH {{journal_short}}
To receive complimentary publication alerts, simply confirm your interest below:

Yes, keep me informed: {{confirm_url}}

Subscription is entirely optional. You may update your preferences or unsubscribe at any time. If you take no action, you will not receive further publication alerts.
This invitation expires on {{expires_on}}.

We look forward to sharing new scientific developments and welcoming your future contributions to the journal.

${textFooter("You are receiving this one-time invitation because your address was included in a list of researchers whose work relates to the {{journal_title}}.")}`,
    },

    notify_welcome: {
        subject: "Your {{site_name}} alerts are active",
        description: "Sent once the subscriber confirms.",
        variables: [...COMMON_VARIABLES],
        html_content: layout({
            masthead: SITE_MAST,
            reason: "You are receiving this message because you confirmed your subscription to {{site_name}} publication alerts.",
            body: [
                h1("Your alerts are now active"),
                p("Dear {{recipient_name}},"),
                p("Thank you for confirming. You will now receive publication alerts from {{site_name}} for the journals and disciplines you selected."),
                p("You can follow additional journals, add or remove disciplines, choose a weekly or daily digest, or pause issue alerts from your preference centre at any time."),
                button("Review your preferences", "manage_url"),
            ].join("\n"),
        }),
        text_content: `Dear {{recipient_name}},

Thank you for confirming. You will now receive publication alerts from {{site_name}} for the journals and disciplines you selected.

You can follow additional journals, add or remove disciplines, choose a weekly or daily digest, or pause issue alerts from your preference centre at any time:
{{manage_url}}

${textFooter("You are receiving this message because you confirmed your subscription to {{site_name}} publication alerts.")}`,
    },

    notify_new_issue: {
        subject: "{{journal_title}} · Vol. {{volume}}, No. {{number}} ({{year}}) is now available",
        description: "New issue alert with the table of contents, grouped by section.",
        variables: [...COMMON_VARIABLES, "journal_title", "journal_issn", "journal_issn_line", "journal_url", "volume", "number", "year", "issue_title", "cover_url", "editor_note", "editor_note_html", "issue_url", "toc_html", "toc_text"],
        html_content: layout({
            masthead: mastLink("journal_url", "{{journal_title}}"),
            mastheadSub: "{{journal_issn_line}}",
            reason: "You are receiving this message because you follow {{journal_title}} or one of its disciplines on {{site_name}}.",
            body: [
                `<p class="muted" style="margin:0 0 6px;font-family:${SANS};font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${C.muted}">New issue · Vol. {{volume}}, No. {{number}} ({{year}})</p>`,
                h1("{{issue_title}}"),
                p("Dear {{recipient_name}},"),
                p("A new issue of <em>{{journal_title}}</em> has been published. The table of contents is below."),
                "{{{editor_note_html}}}",
                "{{{toc_html}}}",
                button("Read the full issue", "issue_url"),
            ].join("\n"),
        }),
        text_content: `NEW ISSUE: {{journal_title}}, Vol. {{volume}}, No. {{number}} ({{year}})
{{issue_title}}

Dear {{recipient_name}},

A new issue of {{journal_title}} has been published.

{{editor_note}}

TABLE OF CONTENTS
{{toc_text}}

Read the full issue: {{issue_url}}

${textFooter("You are receiving this message because you follow {{journal_title}} or one of its disciplines on {{site_name}}.")}`,
    },

    notify_weekly_digest: {
        subject: "New research in {{top_disciplines}} — week of {{week_start}}",
        description: "Weekly digest of newly published articles in the subscriber's fields.",
        variables: [...COMMON_VARIABLES, "top_disciplines", "week_start", "count", "articles_html", "articles_text"],
        html_content: layout({
            masthead: SITE_MAST,
            mastheadSub: "Weekly research digest",
            reason: "You are receiving this weekly digest because you subscribed to {{site_name}} alerts for these disciplines.",
            body: [
                h1("New research in your fields"),
                p("Dear {{recipient_name}},"),
                p("{{count}} article(s) matching your interests were published during the week of {{week_start}}."),
                "{{{articles_html}}}",
                button("More in your fields", "site_url"),
            ].join("\n"),
        }),
        text_content: `WEEKLY RESEARCH DIGEST, week of {{week_start}}

Dear {{recipient_name}},

{{count}} article(s) matching your interests were published this week.

{{articles_text}}

More on {{site_name}}: {{site_url}}

${textFooter("You are receiving this weekly digest because you subscribed to {{site_name}} alerts for these disciplines.")}`,
    },

    notify_daily_digest: {
        subject: "{{count}} new article(s) in your fields — {{date}}",
        description: "Compact daily digest for subscribers who chose daily article alerts.",
        variables: [...COMMON_VARIABLES, "date", "count", "articles_html", "articles_text"],
        html_content: layout({
            masthead: SITE_MAST,
            mastheadSub: "Daily research alert",
            reason: "You are receiving this daily alert because you chose daily article emails in your {{site_name}} preferences.",
            body: [
                p("Dear {{recipient_name}},"),
                p("{{count}} new article(s) in your fields were published on {{date}}."),
                "{{{articles_html}}}",
            ].join("\n"),
        }),
        text_content: `DAILY RESEARCH ALERT, {{date}}

Dear {{recipient_name}},

{{count}} new article(s) in your fields were published.

{{articles_text}}

${textFooter("You are receiving this daily alert because you chose daily article emails in your {{site_name}} preferences.")}`,
    },

    notify_preferences_updated: {
        subject: "Your alert preferences were updated",
        description: "Confirms a change made in the preference centre.",
        variables: [...COMMON_VARIABLES],
        html_content: layout({
            masthead: SITE_MAST,
            reason: "You are receiving this message because the alert preferences for this address were changed.",
            body: [
                h1("Your preferences were updated"),
                p("Dear {{recipient_name}},"),
                p("The publication alert preferences for this address were updated. You can review the current journals, disciplines and frequency in your preference centre."),
                button("Review your preferences", "manage_url"),
                small("If you did not make this change, you can restore your preferences from the link above, or unsubscribe from all alerts."),
            ].join("\n"),
        }),
        text_content: `Dear {{recipient_name}},

The publication alert preferences for this address were updated. Review them here:
{{manage_url}}

If you did not make this change, you can restore your preferences from the link above, or unsubscribe from all alerts.

${textFooter("You are receiving this message because the alert preferences for this address were changed.")}`,
    },

    notify_custom_message: {
        subject: "A message from {{sender_name}}",
        description: "General-purpose letter for messages written by an admin (New message). The text goes in message_html / message_text.",
        variables: [...COMMON_VARIABLES, "sender_name", "message_heading", "message_html", "message_text"],
        html_content: layout({
            masthead: mastLink("site_url", "{{sender_name}}"),
            reason: "You are receiving this message because you subscribed to publication alerts from {{site_name}}.",
            body: [
                h1("{{message_heading}}"),
                p("Dear {{recipient_name}},"),
                "{{{message_html}}}",
            ].join("\n"),
        }),
        text_content: `{{message_heading}}

Dear {{recipient_name}},

{{message_text}}

${textFooter("You are receiving this message because you subscribed to publication alerts from {{site_name}}.")}`,
    },
}
}

/** The shipped Classic set (the default style). */
export const TEMPLATE_SET: Record<string, TemplateDefinition> = buildTemplateSet(EMAIL_STYLES.classic)
