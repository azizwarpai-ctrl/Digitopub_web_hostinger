/**
 * Transport for publication-alert mail (#201), separate from the
 * transactional transport in ./transport.ts so bulk volume runs through its
 * own mailbox and cannot affect OTP or admin email.
 *
 * v1 is the hosting provider's SMTP (pooled). The interface is the seam for
 * a later SES / Resend adapter: callers only see `send()` and its outcome.
 */

import "server-only"
import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

export interface NotificationMessage {
    to: string
    subject: string
    html: string
    text: string
    headers: Record<string, string>
}

export type SendOutcome = { ok: true } | { ok: false; permanent: boolean; error: string }

export interface NotificationTransport {
    send(message: NotificationMessage): Promise<SendOutcome>
}

const env = (name: string) => process.env[`NOTIFY_${name}`] || process.env[name] || ""

/** True when an SMTP host and credentials are available (NOTIFY_SMTP_* or the SMTP_* fallback). */
export function isNotificationSmtpConfigured(): boolean {
    return !!(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASSWORD"))
}

export function notificationFromAddress(): string {
    const address = env("SMTP_FROM_EMAIL") || env("SMTP_USER")
    const name = (process.env.NOTIFY_FROM_NAME || "DigitoPub Alerts").replace(/["\\\r\n]/g, "")
    return `"${name}" <${address}>`
}

/**
 * Classifies an SMTP failure. A 5xx reply means the recipient (or message)
 * is rejected for good; 4xx replies and connection errors may succeed later.
 */
export function classifySmtpError(err: unknown): { permanent: boolean; error: string } {
    const e = err as { responseCode?: number; message?: string; code?: string }
    const code = typeof e?.responseCode === "number" ? e.responseCode : null
    const message = (e?.message || e?.code || "Unknown SMTP error").slice(0, 500)
    return { permanent: code !== null && code >= 500 && code < 600, error: code ? `${code} ${message}` : message }
}

export class SmtpNotificationTransport implements NotificationTransport {
    private transporter: Transporter | null = null

    private get(): Transporter {
        if (this.transporter) return this.transporter
        const port = Number.parseInt(env("SMTP_PORT") || "587", 10)
        if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error(`Invalid notification SMTP port: ${env("SMTP_PORT")}`)
        // env() treats "" as unset, so a blank NOTIFY_SMTP_SECURE= falls back to SMTP_SECURE.
        const secureRaw = env("SMTP_SECURE") || undefined
        this.transporter = nodemailer.createTransport({
            pool: true,
            maxConnections: 2,
            maxMessages: 50,
            host: env("SMTP_HOST"),
            port,
            secure: secureRaw !== undefined ? secureRaw === "true" : port === 465,
            auth: { user: env("SMTP_USER"), pass: env("SMTP_PASSWORD") },
        })
        return this.transporter
    }

    async send(message: NotificationMessage): Promise<SendOutcome> {
        if (!isNotificationSmtpConfigured()) return { ok: false, permanent: false, error: "Notification SMTP not configured" }
        try {
            await this.get().sendMail({
                from: notificationFromAddress(),
                to: message.to,
                subject: message.subject,
                html: message.html,
                text: message.text,
                headers: message.headers,
            })
            return { ok: true }
        } catch (err) {
            return { ok: false, ...classifySmtpError(err) }
        }
    }

    close() {
        this.transporter?.close()
        this.transporter = null
    }
}

let shared: SmtpNotificationTransport | null = null

export function getNotificationTransport(): NotificationTransport {
    shared ??= new SmtpNotificationTransport()
    return shared
}
