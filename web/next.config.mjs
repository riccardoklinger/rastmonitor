/** @type {import('next').NextConfig} */
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const martinUrl = process.env.MARTIN_URL ?? 'http://localhost:3000'
    return [
      {
        source: '/tiles/:path*',
        destination: `${martinUrl}/:path*`,
      },
    ]
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
