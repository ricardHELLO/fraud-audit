/** @type {import('next').NextConfig} */

// SEC-06: Headers de seguridad HTTP estándar. Un informe de fraude con datos
// sensibles no debe poder embeberse en un iframe (clickjacking), y queremos
// limitar el acceso a APIs del navegador que no usamos.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Strict-Transport-Security lo añadimos sólo en producción: en dev (http://localhost)
  // el navegador ignora el header y en preview de Vercel ya viene forzado por la plataforma,
  // así que lo dejamos fuera para no sorprender en entornos locales.
];

const nextConfig = {
  experimental: {},
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
