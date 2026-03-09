const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fraud-audit.vercel.app'

// ---------------------------------------------------------------------------
// Shared layout wrapper
// ---------------------------------------------------------------------------

function emailLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:24px;font-weight:bold;color:#1c1917;letter-spacing:-0.025em;">FraudAudit</span>
    </div>
    <!-- Card -->
    <div style="background:white;border-radius:12px;padding:32px;border:1px solid #e7e5e4;">
      ${content}
    </div>
    <!-- Footer -->
    <div style="text-align:center;margin-top:24px;color:#a8a29e;font-size:12px;">
      FraudAudit &mdash; Analisis de Fraude Operativo para Restaurantes
    </div>
  </div>
</body>
</html>`
}

function ctaButton(text: string, url: string): string {
  return `<div style="text-align:center;margin-top:24px;">
  <a href="${url}" style="display:inline-block;background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
    ${text}
  </a>
</div>`
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function welcomeEmail(name: string | null): { subject: string; html: string } {
  const greeting = name ? `Hola ${name},` : 'Hola,'

  return {
    subject: 'Bienvenido a FraudAudit',
    html: emailLayout(`
      <h1 style="margin:0 0 16px;font-size:20px;color:#1c1917;">${greeting}</h1>
      <p style="margin:0 0 12px;color:#57534e;font-size:14px;line-height:1.6;">
        Bienvenido a <strong>FraudAudit</strong>. Tu cuenta esta lista para empezar a analizar
        fraude operativo en tu restaurante.
      </p>
      <p style="margin:0 0 12px;color:#57534e;font-size:14px;line-height:1.6;">
        Tienes <strong>100 ejecuciones gratuitas</strong> para generar informes de analisis.
        Sube tus datos de tu TPV o sistema de inventario y obtendras un informe completo en minutos.
      </p>
      <p style="margin:0;color:#57534e;font-size:14px;line-height:1.6;">
        Tambien puedes ganar ejecuciones extra completando acciones como dar feedback,
        invitar a otros restaurantes o reportar bugs.
      </p>
      ${ctaButton('Ir al Dashboard', `${APP_URL}/dashboard`)}
    `),
  }
}

export function reportReadyEmail(
  name: string | null,
  reportSlug: string,
  orgName: string
): { subject: string; html: string } {
  const greeting = name ? `Hola ${name},` : 'Hola,'

  return {
    subject: `Tu informe de fraude esta listo - ${orgName}`,
    html: emailLayout(`
      <h1 style="margin:0 0 16px;font-size:20px;color:#1c1917;">${greeting}</h1>
      <p style="margin:0 0 12px;color:#57534e;font-size:14px;line-height:1.6;">
        Tu informe de analisis de fraude para <strong>${orgName}</strong> ha sido generado
        correctamente.
      </p>
      <p style="margin:0 0 12px;color:#57534e;font-size:14px;line-height:1.6;">
        El informe incluye analisis de descuadres de caja, facturas eliminadas,
        productos cancelados, mermas e inventario. Revisa los resultados y las
        acciones recomendadas.
      </p>
      ${ctaButton('Ver informe', `${APP_URL}/informe/${reportSlug}`)}
      <p style="margin:16px 0 0;color:#a8a29e;font-size:12px;text-align:center;">
        Tambien puedes compartir este enlace con tu equipo.
      </p>
    `),
  }
}

export function alertTriggeredEmail(
  name: string | null,
  reportSlug: string,
  triggeredAlerts: { ruleName: string; actualValue: number; threshold: number }[]
): { subject: string; html: string } {
  const greeting = name ? `Hola ${name},` : 'Hola,'

  const alertRows = triggeredAlerts
    .map(
      (a) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;color:#1c1917;font-size:14px;">${a.ruleName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;color:#dc2626;font-size:14px;font-weight:600;">${a.actualValue}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;color:#57534e;font-size:14px;">${a.threshold}</td>
        </tr>`
    )
    .join('')

  return {
    subject: `Alerta de fraude activada - ${triggeredAlerts.length} regla${triggeredAlerts.length > 1 ? 's' : ''}`,
    html: emailLayout(`
      <h1 style="margin:0 0 16px;font-size:20px;color:#1c1917;">${greeting}</h1>
      <p style="margin:0 0 12px;color:#57534e;font-size:14px;line-height:1.6;">
        Se han activado <strong>${triggeredAlerts.length}</strong> alerta${triggeredAlerts.length > 1 ? 's' : ''}
        en tu ultimo informe de fraude. Revisa los detalles a continuacion:
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr style="background:#f5f5f4;">
            <th style="padding:8px 12px;text-align:left;color:#78716c;font-size:12px;font-weight:600;text-transform:uppercase;">Regla</th>
            <th style="padding:8px 12px;text-align:left;color:#78716c;font-size:12px;font-weight:600;text-transform:uppercase;">Valor actual</th>
            <th style="padding:8px 12px;text-align:left;color:#78716c;font-size:12px;font-weight:600;text-transform:uppercase;">Umbral</th>
          </tr>
        </thead>
        <tbody>
          ${alertRows}
        </tbody>
      </table>
      ${ctaButton('Ver informe', `${APP_URL}/informe/${reportSlug}`)}
    `),
  }
}

export function purchaseConfirmationEmail(
  name: string | null,
  creditsAmount: number,
  totalPaid: number
): { subject: string; html: string } {
  const greeting = name ? `Hola ${name},` : 'Hola,'

  return {
    subject: 'Compra confirmada - FraudAudit',
    html: emailLayout(`
      <h1 style="margin:0 0 16px;font-size:20px;color:#1c1917;">${greeting}</h1>
      <p style="margin:0 0 12px;color:#57534e;font-size:14px;line-height:1.6;">
        Tu compra ha sido procesada correctamente. Aqui tienes el resumen:
      </p>
      <div style="background:#f5f5f4;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#78716c;font-size:14px;">Ejecuciones anadidas</span>
          <span style="color:#1c1917;font-weight:600;font-size:14px;">${creditsAmount}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#78716c;font-size:14px;">Total pagado</span>
          <span style="color:#1c1917;font-weight:600;font-size:14px;">${totalPaid.toFixed(2)} &euro;</span>
        </div>
      </div>
      <p style="margin:0;color:#57534e;font-size:14px;line-height:1.6;">
        Las ejecuciones ya estan disponibles en tu cuenta. Puedes empezar a
        generar nuevos informes de analisis.
      </p>
      ${ctaButton('Ir al Dashboard', `${APP_URL}/dashboard`)}
    `),
  }
}
