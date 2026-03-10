/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  async redirects() {
    return [
      {
        source: '/reports/:slug',
        destination: '/informe/:slug',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
