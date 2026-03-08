import { Resend } from 'resend'

// Use Resend's onboarding address until a custom domain is verified.
// Once verified, change to: 'FraudAudit <noreply@fraudaudit.com>'
const FROM_EMAIL = 'FraudAudit <onboarding@resend.dev>'

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[Email] Skipped (no RESEND_API_KEY):', params.subject, '→', params.to)
    return
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })

    console.log('[Email] Sent:', params.subject, '→', params.to)
  } catch (error) {
    console.error('[Email] Failed to send:', error)
    // Don't throw — emails should never block the main flow
  }
}
