'use client'

import { useEffect } from 'react'

/**
 * Root-level fallback cuando `app/layout.tsx` falla al renderizarse.
 *
 * A diferencia de `app/error.tsx`, aquí Next.js ya no puede asumir que el
 * layout raíz montó `<html>` / `<body>`, así que este componente DEBE
 * incluirlos. Estilos inline para no depender de que Tailwind haya cargado.
 *
 * AUDIT-014: antes no había red de seguridad para fallos del layout raíz
 * (p.ej. Clerk caído en render, falla de hydration del provider). El usuario
 * veía una página en blanco sin mensaje ni acción posible.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError] root layout failed', {
      digest: error.digest,
      message: error.message,
    })
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fafaf9', // stone-50
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
          color: '#1c1917', // stone-900
          padding: '1rem',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <div
            style={{
              margin: '0 auto 1.5rem',
              height: '4rem',
              width: '4rem',
              borderRadius: '9999px',
              backgroundColor: '#fee2e2', // red-100
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
            }}
            aria-hidden="true"
          >
            ⚠️
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
            Algo fue mal cargando la aplicación
          </h2>
          <p
            style={{
              marginTop: '0.5rem',
              fontSize: '0.875rem',
              color: '#78716c', // stone-500
            }}
          >
            Se ha producido un error inesperado. Recarga la página o vuelve a
            intentarlo en unos segundos.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: '1rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.75rem',
                color: '#a8a29e', // stone-400
              }}
            >
              Ref. técnica: <span>{error.digest}</span>
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              borderRadius: '0.5rem',
              backgroundColor: '#0f766e', // brand-600 aproximado (teal-700)
              color: 'white',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
