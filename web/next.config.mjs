/** @type {import('next').NextConfig} */
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

export default nextConfig
