/**
 * Ready-made visual styles for the notification email set (style gallery).
 * A style only changes the design: colours, fonts, masthead and card. The
 * wording, variables and footer rules are shared by every style
 * (template-set.ts). One style is active for the whole set, because the
 * server-built blocks (render-blocks.ts) must match the surrounding email.
 */

export const EMAIL_STYLE_KEYS = ["classic", "modern", "minimal"] as const
export type EmailStyleKey = (typeof EMAIL_STYLE_KEYS)[number]

export const DEFAULT_EMAIL_STYLE: EmailStyleKey = "classic"

export interface EmailStyle {
    key: EmailStyleKey
    name: string
    description: string
    colors: {
        /** Page background around the card. */
        page: string
        card: string
        ink: string
        muted: string
        rule: string
        /** Buttons, links and masthead accents. */
        accent: string
        buttonText: string
        /** Secondary text inside article lists (authors, section headings). */
        meta: string
        openAccess: string
        /** Background of the editor's note. */
        noteBg: string
    }
    fonts: {
        heading: string
        body: string
        /** Article titles and the editor's note. */
        title: string
    }
    headingWeight: string
    buttonRadius: string
    /** Inline CSS of the masthead cell and the colour of its link. */
    mastCss: string
    mastLink: string
    /** Inline CSS of the content card. */
    cardCss: string
    /** Dark-mode overrides (prefers-color-scheme). */
    dark: { bg: string; card: string; border: string; ink: string; muted: string; mast: string; button: string; link: string }
}

const SERIF = "Georgia,'Times New Roman',Times,serif"
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const classic: EmailStyle = {
    key: "classic",
    name: "Classic",
    description: "Navy accents on ivory, serif headings and a ruled masthead. The traditional journal look.",
    colors: {
        page: "#FAF8F3", card: "#FFFFFF", ink: "#2B2B2B", muted: "#5A5A5A", rule: "#E3DED3",
        accent: "#1F3A5F", buttonText: "#FFFFFF", meta: "#555", openAccess: "#2e7d32", noteBg: "#FAF8F3",
    },
    fonts: { heading: SERIF, body: SANS, title: "Georgia,serif" },
    headingWeight: "normal",
    buttonRadius: "4px",
    mastCss: `padding:0 0 14px;border-bottom:2px solid #1F3A5F;font-family:${SERIF};font-size:20px;color:#1F3A5F`,
    mastLink: "#1F3A5F",
    cardCss: "background:#FFFFFF;border:1px solid #E3DED3;border-top:0;padding:36px 40px",
    dark: {
        bg: "#14171C", card: "#1E232B", border: "#2E3540", ink: "#E8E6E1", muted: "#A9AFB8",
        mast: "color:#E8E6E1 !important; border-color:#2E3540 !important;", button: "#4C7BB3", link: "#8DB3E2",
    },
}

const modern: EmailStyle = {
    key: "modern",
    name: "Modern",
    description: "A teal masthead band, clean sans-serif type and rounded buttons. Bright and contemporary.",
    colors: {
        page: "#F3F5F8", card: "#FFFFFF", ink: "#1A202C", muted: "#5B6473", rule: "#E2E8F0",
        accent: "#0F6E8C", buttonText: "#FFFFFF", meta: "#5B6473", openAccess: "#2e7d32", noteBg: "#EEF6F9",
    },
    fonts: { heading: SANS, body: SANS, title: SANS },
    headingWeight: "600",
    buttonRadius: "6px",
    mastCss: `padding:20px 28px;background:#0F6E8C;border-radius:8px 8px 0 0;font-family:${SANS};font-size:20px;font-weight:600;color:#FFFFFF`,
    mastLink: "#FFFFFF",
    cardCss: "background:#FFFFFF;border:1px solid #E2E8F0;border-top:0;border-radius:0 0 8px 8px;padding:32px 36px",
    dark: {
        bg: "#111418", card: "#1B2027", border: "#2C333D", ink: "#E6EAF0", muted: "#A3ADBA",
        mast: "background:#0B4F65 !important; color:#FFFFFF !important;", button: "#1C8FB3", link: "#7CC7E0",
    },
}

const minimal: EmailStyle = {
    key: "minimal",
    name: "Minimal",
    description: "Plain, text-first layout with thin rules and no colour band. Reads like a personal letter.",
    colors: {
        page: "#FFFFFF", card: "#FFFFFF", ink: "#111111", muted: "#666666", rule: "#E5E5E5",
        accent: "#111111", buttonText: "#FFFFFF", meta: "#666666", openAccess: "#2e7d32", noteBg: "#F5F5F5",
    },
    fonts: { heading: SANS, body: SANS, title: SANS },
    headingWeight: "600",
    buttonRadius: "0",
    mastCss: `padding:0 0 12px;border-bottom:1px solid #E5E5E5;font-family:${SANS};font-size:16px;font-weight:600;color:#111111`,
    mastLink: "#111111",
    cardCss: "background:#FFFFFF;padding:28px 0",
    dark: {
        bg: "#121212", card: "#121212", border: "#2A2A2A", ink: "#EDEDED", muted: "#A0A0A0",
        mast: "color:#EDEDED !important; border-color:#2A2A2A !important;", button: "#3A3A3A", link: "#9CC3FF",
    },
}

export const EMAIL_STYLES: Record<EmailStyleKey, EmailStyle> = { classic, modern, minimal }

export function isEmailStyleKey(value: unknown): value is EmailStyleKey {
    return typeof value === "string" && (EMAIL_STYLE_KEYS as readonly string[]).includes(value)
}

/** The style for a stored key, falling back to the default for unknown values. */
export function getEmailStyle(key: unknown): EmailStyle {
    return EMAIL_STYLES[isEmailStyleKey(key) ? key : DEFAULT_EMAIL_STYLE]
}
