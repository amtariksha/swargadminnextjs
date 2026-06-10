/**
 * Direct Postgres access for the public /api/storefront/* read routes
 * (Phase 3 of the swargfood.com <-> ops unification).
 *
 * Queries the ops schema (`app_db.*`) through the SAME pool Payload's
 * postgres adapter holds — app_db is co-located with the Payload schema on
 * the one Supabase project (the whole point of the co-location). Payload's
 * adapter itself only models the Payload collections, so ops reads are raw
 * SQL here.
 *
 * Conventions (differ from swargnodejsbackend!):
 *  - Postgres-native $1..$n placeholders (no `?` adapter).
 *  - REAL table names (`app_db.category`, `app_db.subcategory`) — the
 *    backend's `cat`/`sub_cat` spellings only work there because of its
 *    runtime rewriter, which does not exist on this side.
 *  - Polymorphic `images.table_name` values stay the LITERALS
 *    'product' / 'cat' / 'sub_cat' — they are data, not identifiers.
 *  - TIMESTAMP/DATE columns are `to_char(...)`-cast in SQL so the API emits
 *    the same IST wall-clock strings as node.desicowmilk.com (node-postgres
 *    would otherwise parse them into Date objects and shift them on
 *    serialisation).
 */

import { getPayload } from 'payload'
import configPromise from '@payload-config'

interface PgPoolLike {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

export type Row = Record<string, unknown>

export async function sfQuery(text: string, params: unknown[] = []): Promise<Row[]> {
  const payload = await getPayload({ config: configPromise })
  const pool = (payload.db as unknown as { pool?: PgPoolLike }).pool
  if (!pool) {
    throw new Error('storefront: Payload postgres pool unavailable (db adapter has no .pool)')
  }
  const result = await pool.query(text, params)
  return result.rows
}

// ── coercion helpers (pg returns BIGINT/NUMERIC as strings) ────────────────
export const toInt = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export const toFloat = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const toStr = (v: unknown): string | null => (v == null ? null : String(v))

/** 0/1 flag with a default for NULL (SMALLINT columns). */
export const toFlag = (v: unknown, whenNull: 0 | 1 = 0): 0 | 1 =>
  v == null ? whenNull : (Number(v) ? 1 : 0)

/** jsonb arrives parsed from pg; guard the string/legacy path. */
export const parseJsonb = (raw: unknown): unknown => {
  if (raw == null) return null
  if (typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      return JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  return null
}
