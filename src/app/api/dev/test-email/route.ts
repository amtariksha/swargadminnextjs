/**
 * One-shot test-email endpoint — smoke-test that Resend is wired correctly.
 *
 * Auth: same SCHEMA_PUSH_SECRET pattern as /api/dev/push-schema. Pass the
 * token via `?token=` query (browser-friendly) or `Authorization: Bearer`.
 *
 * Usage:
 *   GET /api/dev/test-email?token=...&to=you@example.com
 *
 * Returns the Resend message id on success. Returns the adapter's error
 * body on failure (most commonly: invalid API key, unverified sending
 * domain, or `to` not on the verified-recipients list when RESEND_API_KEY
 * is a sandbox key).
 *
 * Remove this route once the migration emails (order confirmation, etc.)
 * have their own send paths.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

const isAuthorized = (req: NextRequest, expected: string): boolean => {
  const header = req.headers.get('authorization') ?? ''
  if (header === `Bearer ${expected}`) return true
  const queryToken = req.nextUrl.searchParams.get('token')
  if (queryToken && queryToken === expected) return true
  return false
}

const handle = async (req: NextRequest): Promise<NextResponse> => {
  const expected = process.env.SCHEMA_PUSH_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'SCHEMA_PUSH_SECRET env var is not configured.' },
      { status: 500 },
    )
  }
  if (!isAuthorized(req, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const to = req.nextUrl.searchParams.get('to')
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json(
      { error: 'Pass a valid ?to=email@example.com' },
      { status: 400 },
    )
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'RESEND_API_KEY is not set. Payload is using its console fallback — emails will not actually send. Set RESEND_API_KEY in Vercel and redeploy.',
      },
      { status: 500 },
    )
  }

  try {
    const payload = await getPayload({ config })
    const subject = 'Swarg Food — Resend smoke test'
    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #4CAF50; margin: 0 0 16px;">Swarg Food</h1>
        <p>This is a smoke-test email from the Payload Resend adapter.</p>
        <p>If you're reading this, the adapter + API key + verified sending domain are all wired correctly.</p>
        <p style="color: #666; font-size: 13px; margin-top: 24px;">
          Sent ${new Date().toISOString()} from <code>${process.env.EMAIL_FROM || 'orders@swargfood.com'}</code>
        </p>
      </div>
    `
    const result = await payload.sendEmail({
      to,
      subject,
      html,
    })
    return NextResponse.json({ ok: true, to, result })
  } catch (err) {
    const e = err as Error
    console.error('[test-email] failed:', e)
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'unknown error', stack: e?.stack },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
