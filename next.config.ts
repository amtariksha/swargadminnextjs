import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Empty turbopack config silences the Next.js 16 build warning that fires
  // because withPayload injects a webpack config. See payloadcms/payload#14354.
  turbopack: {},

  // drizzle-kit is normally a dev-only dep, but the /api/dev/push-schema
  // route loads it at runtime via Payload's adapter to apply schema diffs
  // in production (Payload's pushDevSchema is hardcoded to skip when
  // NODE_ENV === 'production'). Keep it out of the bundle and load it
  // from node_modules at runtime instead.
  serverExternalPackages: ['drizzle-kit'],

  // next/image rejects any remote host that isn't listed here, and this config
  // had no `images` block at all — so /_next/image returned 400 for every
  // Payload media URL (verified against the live admin on both the r2.dev and
  // custom-domain hosts). Pre-existing, but it would have looked like fallout
  // from moving R2_PUBLIC_URL off r2.dev, so it is fixed alongside.
  //
  // media.swargfood.com is the R2 bucket's custom domain; **.r2.dev stays for
  // anything still holding a URL minted before the switch.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.swargfood.com' },
      { protocol: 'https', hostname: '**.r2.dev' },
      // Ops catalog images: node.desicowmilk.com 302s these to the R2 domain,
      // and next/image validates the redirect target as well as the source.
      { protocol: 'https', hostname: 'node.desicowmilk.com' },
    ],
  },

  // Historical note: a `rewrites()` block previously mapped legacy WACRM
  // webhook paths (`/api/webhooks/*`, `/api/ctwa/*`, `/api/meta/*`) to the
  // namespaced `/api/whatsapp/*` handlers so external services could keep
  // calling the old `whatsapp.swargfood.com` URLs during the WACRM merge.
  // The cutover is complete (Meta / MSG91 / Razorpay / FB OAuth now point
  // at `admin.desicowmilk.com/api/whatsapp/*` directly; the
  // whatsapp.swargfood.com subdomain has been removed from Vercel + DNS),
  // so the rewrites have been retired. If you ever need to re-front the
  // namespaced paths from a vanity URL again, add a fresh `rewrites()`
  // block here — the underlying handlers haven't moved.
}

export default withPayload(nextConfig)
