import type { Metadata } from 'next'

/**
 * AUDIT-015: metadata por sub-ruta. La page.tsx es Client Component
 * y no puede exportar `metadata`, así que este layout server-only lo
 * aporta sin cambiar el árbol de render.
 */
export const metadata: Metadata = {
  title: 'Subir CSV — FraudAudit',
  description:
    'Sube el export CSV de tu POS e inventario para iniciar un análisis de fraude operativo.',
}

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return children
}
