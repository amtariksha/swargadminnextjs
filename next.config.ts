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

  // Legacy-path compatibility for the WACRM merge.
  //
  // External services (Meta WhatsApp Cloud API, MSG91, Razorpay, Facebook
  // OAuth for CTWA) were configured to call WACRM at `whatsapp.swargfood.com`
  // on un-namespaced paths like `/api/webhooks/meta`. Inside the admin panel
  // those handlers now live under `/api/whatsapp/...`.
  //
  // Rather than reconfigure five external dashboards (and risk webhook drops
  // during cutover), we point `whatsapp.swargfood.com` DNS at the admin
  // panel and rewrite the old paths internally. The external services keep
  // hitting the same URL; Next.js routes the request to the new handler.
  //
  // These are `afterFiles` rewrites (the default), so they run AFTER our
  // middleware. Since the middleware matcher is `/api/whatsapp/:path*`, the
  // legacy `/api/webhooks/...` paths bypass the auth bridge entirely — which
  // is what we want, because webhooks self-authenticate via provider
  // signatures (HMAC-SHA256 against FACEBOOK_APP_SECRET / Razorpay secret).
  async rewrites() {
    return [
      // Provider webhooks
      { source: '/api/webhooks/:path*', destination: '/api/whatsapp/webhooks/:path*' },
      // Click-to-WhatsApp OAuth callback (Facebook redirect URI registered
      // in the FB App dashboard points at the legacy path).
      { source: '/api/ctwa/:path*', destination: '/api/whatsapp/ctwa/:path*' },
      // Meta Embedded Signup callback used during number onboarding.
      { source: '/api/meta/:path*', destination: '/api/whatsapp/meta/:path*' },
    ]
  },
}

export default withPayload(nextConfig)
