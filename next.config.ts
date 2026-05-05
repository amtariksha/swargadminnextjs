import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Empty turbopack config silences the Next.js 16 build warning that fires
  // because withPayload injects a webpack config. See payloadcms/payload#14354.
  turbopack: {},
}

export default withPayload(nextConfig)
