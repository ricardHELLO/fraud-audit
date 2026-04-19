import { Resend } from 'resend'

// INT-03: FROM address configurable por entorno.
//
// Resend solo permite enviar a direcciones arbitrarias desde dominios
// verificados; desde `onboarding@resend.dev` (sandbox) los emails
// solo llegan al dueño de la cuenta. Para producción hay que:
//
//   1. Verificar `fraudaudit.com` (o el dominio elegido) en
//      https://resend.com/domains — añadir los registros SPF/DKIM/DMARC
//      que Resend muestra al panel DNS.
//   2. En Vercel Env: `RESEND_FROM="FraudAudit <noreply@fraudaudit.com>"`.
//
// Mientras `RESEND_FROM` no esté seteado, caemos al sandbox — el código
// sigue funcionando (no se rompe el deploy), solo que los emails no
// llegan a usuarios externos. El log lo deja claro.
const SANDBOX_FROM = 'FraudAudit <onboarding@resend.dev>'
const FROM_EMAIL = process.env.RESEND_FROM?.trim() || SANDBOX_FROM

let warnedSandbox = false
function warnSandboxOnce() {
  if (warnedSandbox) return
  warnedSandbox = true
  if (FROM_EMAIL === SANDBOX_FROM) {
    console.warn(
      '[Email] RESEND_FROM no está configurado — usando sandbox. ' +
        'Los emails solo llegan al dueño de la cuenta Resend. ' +
        'Configura un dominio verificado antes de producción.'
    )
  }
}

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[Email] Skipped (no RESEND_API_KEY):', params.subject, '→', params.to)
    return
  }

  warnSandboxOnce()

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
