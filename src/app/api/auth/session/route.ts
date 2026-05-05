import { NextRequest, NextResponse } from 'next/server'
import { SWARG_ADMIN_TOKEN_COOKIE } from '@/payload/strategies/jwtAuth'

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30d, matches Node.js JWT expiry

const cookieDomain = (): string | undefined => {
  // Empty string => host-only cookie (useful for localhost). On prod, set
  // COOKIE_DOMAIN=.desicowmilk.com so admin.* and node.* can both read it.
  const v = process.env.COOKIE_DOMAIN
  if (!v) return undefined
  return v
}

const isSecureRequest = (req: NextRequest): boolean => {
  const proto = req.headers.get('x-forwarded-proto')
  if (proto) return proto === 'https'
  return req.nextUrl.protocol === 'https:'
}

interface SessionPostBody {
  token?: unknown
}

export async function POST(req: NextRequest) {
  let body: SessionPostBody
  try {
    body = (await req.json()) as SessionPostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: SWARG_ADMIN_TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'lax',
    path: '/',
    domain: cookieDomain(),
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
  return res
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: SWARG_ADMIN_TOKEN_COOKIE,
    value: '',
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'lax',
    path: '/',
    domain: cookieDomain(),
    maxAge: 0,
  })
  return res
}
