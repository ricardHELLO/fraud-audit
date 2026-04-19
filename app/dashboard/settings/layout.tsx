import type { Metadata } from 'next'

/**
 * AUDIT-015: metadata por sub-ruta. La page.tsx es Client Component
 * y no puede exportar `metadata`, así que este layout server-only lo
 * aporta sin cambiar el árbol de render.
 */
export const metadata: Metadata = {
  title: 'Configuración — FraudAudit',
  description:
    'Gestiona tu cuenta, alertas, umbrales de riesgo y preferencias de notificación.',
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
