import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import { PostHogProvider } from '@/components/posthog-provider'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'FraudAudit - Analisis de Fraude Operativo para Restaurantes',
  description:
    'Detecta fraude operativo en tu restaurante con analisis automatizado de datos POS. Identifica cancelaciones sospechosas, descuentos irregulares y patrones de fraude.',
  keywords: [
    'fraude restaurantes',
    'analisis POS',
    'auditoria restaurantes',
    'deteccion fraude',
    'control operativo',
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="es" className={inter.variable}>
        <body className={`${inter.className} antialiased`}>
          <PostHogProvider>
            {children}
          </PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
