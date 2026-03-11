import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Server-only modules — jamais envoyés au client
  serverExternalPackages: ['mongodb'],
}

export default nextConfig
