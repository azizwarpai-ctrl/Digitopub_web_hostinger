import { sendEmail } from "@/src/lib/email/service"

/** Escape a value for an HTML attribute/body (the link is our own URL, but be strict). */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * Admin password-reset email (#165). Always sent by email, regardless of
 * OTP_DELIVERY_METHOD: a reset link must never be printed to server logs.
 */
export async function sendResetEmail(
  to: string,
  resetUrl: string
): Promise<{ success: boolean; error?: string }> {
  const href = escapeHtml(resetUrl)
  return sendEmail({
    to,
    subject: "Reset your DigitoPub admin password",
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<h2 style="color:#333">Reset your password</h2>
<p>We received a request to reset the password for your DigitoPub admin account. This link expires in 15 minutes and can be used once.</p>
<p style="text-align:center;padding:20px"><a href="${href}" style="display:inline-block;background:#0056a4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Reset password</a></p>
<p style="color:#666;font-size:14px">Or paste this link into your browser:<br><span style="word-break:break-all">${href}</span></p>
<p style="color:#666;font-size:14px">If you did not request a reset, you can safely ignore this email. Your password will not change.</p>
</div>`,
    text: `Reset your DigitoPub admin password:\n\n${resetUrl}\n\nThis link expires in 15 minutes and can be used once.\n\nIf you did not request a reset, you can safely ignore this email. Your password will not change.`,
  })
}
