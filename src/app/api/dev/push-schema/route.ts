/**
 * One-shot schema-push endpoint.
 *
 * Why this exists: Payload's `pushDevSchema` is hardcoded to skip when
 * `NODE_ENV === 'production'` (see node_modules/@payloadcms/db-postgres/dist/connect.js)
 * so the `PAYLOAD_PUSH=true` env var has no effect on Vercel. This route
 * bypasses that check by calling drizzle-kit's `pushSchema` directly with
 * the in-memory schema Payload already built.
 *
 * Auth: Bearer token matching SCHEMA_PUSH_SECRET env var.
 *
 * Usage:
 *   curl -X POST -H "Authorization: Bearer $SECRET" \
 *     https://admin.desicowmilk.com/api/dev/push-schema
 *
 * Remove this route once proper Payload migrations are wired up.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

interface PushSchemaResult {
  apply: () => Promise<void>
  hasDataLoss: boolean
  warnings: string[]
  statementsToExecute?: string[]
}

interface DrizzleKitModule {
  pushSchema: (
    schema: unknown,
    drizzle: unknown,
    schemaFilters?: string[],
    tablesFilter?: string[],
    extensionsFilters?: string[],
  ) => Promise<PushSchemaResult>
}

interface PostgresAdapterLike {
  drizzle: unknown
  schema: unknown
  schemaName?: string
  tablesFilter?: string[]
  extensions?: { postgis?: boolean }
  requireDrizzleKit: () => DrizzleKitModule
  execute: (args: { drizzle: unknown; raw: string }) => Promise<{ rows: unknown[] }>
  tables: { payload_migrations: unknown }
}

export async function POST(req: NextRequest) {
  const expected = process.env.SCHEMA_PUSH_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'SCHEMA_PUSH_SECRET env var is not configured.' },
      { status: 500 },
    )
  }

  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await getPayload({ config })
    const adapter = payload.db as unknown as PostgresAdapterLike

    const { pushSchema } = adapter.requireDrizzleKit()
    const result = await pushSchema(
      adapter.schema,
      adapter.drizzle,
      adapter.schemaName ? [adapter.schemaName] : undefined,
      adapter.tablesFilter,
      adapter.extensions?.postgis ? ['postgis'] : undefined,
    )

    const { apply, hasDataLoss, warnings, statementsToExecute } = result

    // Apply unconditionally — caller is the operator and accepts the risk.
    // Warnings + hasDataLoss are returned in the response for review.
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
