/**
 * One-shot schema-push endpoint.
 *
 * Why this exists: Payload's `pushDevSchema` is hardcoded to skip when
 * `NODE_ENV === 'production'` (see node_modules/@payloadcms/db-postgres/dist/connect.js)
 * so the `PAYLOAD_PUSH=true` env var has no effect on Vercel. This route
 * bypasses that check by calling drizzle-kit's `pushSchema` directly with
 * the in-memory schema Payload already built.
 *
 * Auth: token check via SCHEMA_PUSH_SECRET env var. Accepts the token via
 * either the `Authorization: Bearer <token>` header (curl-friendly) OR a
 * `?token=<token>` query string (browser-friendly).
 *
 * Browser usage:
 *   https://admin.desicowmilk.com/api/dev/push-schema?token=YOUR_SECRET
 *
 * curl usage:
 *   curl -X POST -H "Authorization: Bearer $SECRET" \
 *     https://admin.desicowmilk.com/api/dev/push-schema
 *
 * Remove this route once proper Payload migrations are wired up.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
// Direct ESM import so Turbopack's tracer sees the dependency and Vercel
// bundles it. Payload's adapter uses createRequire('drizzle-kit/api') which
// the tracer can't follow → "Cannot find module" at runtime on Vercel.
import { pushSchema as drizzlePushSchema } from 'drizzle-kit/api'

interface PushSchemaResult {
  apply: () => Promise<void>
  hasDataLoss: boolean
  warnings: string[]
  statementsToExecute?: string[]
}

interface PostgresAdapterLike {
  drizzle: unknown
  schema: unknown
  schemaName?: string
  tablesFilter?: string[]
  extensions?: { postgis?: boolean }
}

const isAuthorized = (req: NextRequest, expected: string): boolean => {
  const header = req.headers.get('authorization') ?? ''
  if (header === `Bearer ${expected}`) return true
  const queryToken = req.nextUrl.searchParams.get('token')
  if (queryToken && queryToken === expected) return true
  return false
}

const runPush = async (): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config })
    const adapter = payload.db as unknown as PostgresAdapterLike

    const result = (await drizzlePushSchema(
      adapter.schema as never,
      adapter.drizzle as never,
      adapter.schemaName ? [adapter.schemaName] : undefined,
      adapter.tablesFilter,
      adapter.extensions?.postgis ? ['postgis'] : undefined,
    )) as unknown as PushSchemaResult

    const { apply, hasDataLoss, warnings, statementsToExecute } = result

    // Apply unconditionally — caller is the operator and accepts the risk.
    await apply()

    return NextResponse.json({
      ok: true,
      hasDataLoss,
      warnings,
      statementsApplied: Array.isArray(statementsToExecute) ? statementsToExecute.length : undefined,
    })
  } catch (err) {
    const e = err as Error
    console.error('[push-schema] failed:', e)
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'unknown error', stack: e?.stack },
      { status: 500 },
    )
  }
}

const handle = async (req: NextRequest): Promise<NextResponse> => {
  const expected = process.env.SCHEMA_PUSH_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'SCHEMA_PUSH_SECRET env var is not configured. Set it in Vercel and redeploy.' },
      { status: 500 },
    )
  }
  if (!isAuthorized(req, expected)) {
    return NextResponse.json(
      { error: 'Unauthorized. Pass the token via Authorization: Bearer <token> or ?token=<token>.' },
      { status: 401 },
    )
  }
  return runPush()
}

export const GET = handle
export const POST = handle
