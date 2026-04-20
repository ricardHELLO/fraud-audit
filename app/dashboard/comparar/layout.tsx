import type { Metadata } from 'next'

/**
 * AUDIT-015: metadata por sub-ruta. La page.tsx es Client Component
 * y no puede exportar `metadata`, así que este layout server-only lo
 * aporta sin cambiar el árbol de render.
 */
export const metadata: Metadata = {
  title: 'Comparar informes — FraudAudit',
  description:
    'Compara dos informes de auditoría para detectar evolución del riesgo, nuevas alertas y mejoras entre periodos.',
}

export default function CompararLayout({ children }: { children: React.ReactNode }) {
  return children
}
