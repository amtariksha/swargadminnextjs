import type { AuthStrategy } from 'payload'
import crypto from 'crypto'

/**
 * Cookie name used to ferry the Node.js backend JWT from the Next.js admin
 * `/login` flow into the embedded Payload admin at `/admin`. Set by the
 * `/api/auth/session` route handler on login, cleared on logout.
 */
export const SWARG_ADMIN_TOKEN_COOKIE = 'swarg_admin_token'

const PAYLOAD_ADMIN_PERMISSION = 'payload_admin'
const ME_CACHE_TTL_MS = 60 * 1000

interface AdminMeResponse {
  response: number
  status: boolean
  data?: {
    user: { id: number; email: string; name?: string | null; phone?: string | null }
    roles: Array<{ id: number; title: string; permissions: string[] }>
  }
}

interface CacheEntry {
  expiresAt: number
  payload: AdminMeResponse['data']
}

const meCache = new Map<string, CacheEntry>()

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex')

const parseCookie = (cookieHeader: string | null, name: string): string | null => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

/**
 * HS256 JWT verification using only Node's built-in crypto — avoids relying on
 * `jose` being available as a transitive dep in the deployed bundle. Returns
 * the decoded payload object on success, null on any failure.
 */
const verifyHs256 = (token: string, secret: string): Record<string, unknown> | null => {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, signatureB64] = parts
  let header: { alg?: string; typ?: string }
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (header.alg !== 'HS256') return null

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest()
  let provided: Buffer
  try {
    provided = Buffer.from(signatureB64, 'base64url')
  } catch {
    return null
  }
  if (expected.length !== provided.length) return null
  if (!crypto.timingSafeEqual(expected, provided)) return null

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    return null
  }
  return payload
}

const fetchAdminMe = async (token: string): Promise<AdminMeResponse['data'] | null> => {
  const tokenHash = hashToken(token)
  const cached = meCache.get(tokenHash)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload ?? null
  }

  const backend = process.env.SWARG_BACKEND_URL || 'https://node.desicowmilk.com'
  const tenant = process.env.SWARG_TENANT || 'swarg'
  const url = `${backend.replace(/\/$/, '')}/api/${tenant}/admin/me`

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
  } catch {
    meCache.set(tokenHash, { expiresAt: Date.now() + 5_000, payload: undefined })
    return null
  }
  if (!res.ok) {
    meCache.set(tokenHash, { expiresAt: Date.now() + 5_000, payload: undefined })
    return null
  }
  let json: AdminMeResponse
  try {
    json = (await res.json()) as AdminMeResponse
  } catch {
    return null
  }
  if (json.response !== 200 || !json.data) {
    meCache.set(tokenHash, { expiresAt: Date.now() + 5_000, payload: undefined })
    return null
  }
  meCache.set(tokenHash, { expiresAt: Date.now() + ME_CACHE_TTL_MS, payload: json.data })
  return json.data
}

const hasPayloadAdminPermission = (
  roles: Array<{ permissions: string[] }>
): boolean => {
  if (!roles || roles.length === 0) return false
  // Empty `permissions` array on any role = full access (matches the
  // semantics in src/lib/auth.tsx computePermissions).
  if (roles.some((r) => !r.permissions || r.permissions.length === 0)) return true
  return roles.some((r) => r.permissions.includes(PAYLOAD_ADMIN_PERMISSION))
}

/**
 * Custom Payload auth strategy that bridges the Node.js backend JWT into the
 * embedded Payload CMS admin. Designed to NEVER throw — any failure short-
 * circuits to `{ user: null }` so Payload falls back to its local strategy.
 */
export const swargJwtStrategy: AuthStrategy = {
  name: 'swarg-jwt',
  authenticate: async ({ headers, payload }) => {
    try {
      const cookieHeader = headers.get('cookie')
      const token = parseCookie(cookieHeader, SWARG_ADMIN_TOKEN_COOKIE)
      if (!token) {
        console.info('[swargJwt] no cookie present')
        return { user: null }
      }

      const secret = process.env.JWT_SECRET
      if (!secret) {
        console.warn('[swargJwt] JWT_SECRET is not configured; skipping')
        return { user: null }
      }

      const claims = verifyHs256(token, secret)
      if (!claims) {
        console.warn('[swargJwt] JWT verification failed (bad signature, alg mismatch, or expired)')
        return { user: null }
      }
      console.info('[swargJwt] JWT verified for userId:', claims.userId)

      const me = await fetchAdminMe(token)
      if (!me) {
        const backend = process.env.SWARG_BACKEND_URL || 'https://node.desicowmilk.com'
        const tenant = process.env.SWARG_TENANT || 'swarg'
        console.warn(
          '[swargJwt] /admin/me failed or returned no data. Verify endpoint is deployed at:',
          `${backend.replace(/\/$/, '')}/api/${tenant}/admin/me`
        )
        return { user: null }
      }
      console.info('[swargJwt] /admin/me ok. User:', me.user.email, 'Roles:', me.roles.map(r => r.title))

      if (!hasPayloadAdminPermission(me.roles)) {
        console.warn(
          '[swargJwt] user lacks payload_admin permission. Roles+perms:',
          me.roles.map(r => ({ title: r.title, permissions: r.permissions }))
        )
        return { user: null }
      }

      const email = me.user.email?.toLowerCase().trim()
      if (!email) {
        console.warn('[swargJwt] /admin/me returned no email')
        return { user: null }
      }

      const existing = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
        overrideAccess: true,
      })

      let userDoc = existing.docs[0]
      if (!userDoc) {
        console.info('[swargJwt] creating shadow Payload user for', email)
        userDoc = await payload.create({
          collection: 'users',
          data: {
            email,
            name: me.user.name ?? '',
            role: 'admin',
            password: crypto.randomBytes(32).toString('hex'),
          },
          overrideAccess: true,
        })
      }

      console.info('[swargJwt] AUTH OK for', email)
      return {
        user: {
          ...userDoc,
          collection: 'users',
          _strategy: 'swarg-jwt',
        },
      }
    } catch (err) {
      console.error('[swargJwt] authenticate threw:', err)
      return { user: null }
    }
  },
}
