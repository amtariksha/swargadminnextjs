/**
 * POST /api/admin-tools/import-r2-media
 *
 * Inserts a Payload Media doc whose bytes are *already* in R2.
 * Bypasses Payload's upload pipeline entirely so the bytes never traverse
 * Vercel — used by the WP→Payload migration's media-link phase after the
 * WP uploads directory is bulk-synced to R2 via rclone.
 *
 * The doc is created via `payload.db.create()` (low-level adapter call)
 * so collection validation — which would otherwise demand a `file`
 * upload — is bypassed. The standard upload fields (filename, mimeType,
 * filesize, width, height, alt) are set explicitly; the `url` field is
 * computed at read-time by the s3Storage plugin's `generateFileURL`
 * (configured in src/plugins/index.ts) and resolves to the R2 public URL.
 *
 * Idempotent: if a Media row already exists with the supplied `wpId`,
 * the existing row's id is returned and nothing else changes.
 *
 * Auth: any Payload user with `enableAPIKey=true`. Pass the user's API
 * key in the `Authorization` header — Payload validates it against the
 * user record (the same mechanism it uses for every other REST API
 * call). Accepts both header shapes:
 *   Authorization: users API-Key <token>
 *   Authorization: Bearer <token>
 * No Vercel env var required.
 */

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { z } from 'zod'

import configPromise from '@payload-config'

const BodySchema = z.object({
  wpId: z.union([z.string(), z.number()]).transform((v) => String(v)),
  filename: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(128),
  filesize: z.number().int().nonnegative(),
  alt: z.string().max(1024).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

/**
 * Authenticate the request against any Payload user with an API key.
 * Accepts both `Bearer <token>` and `users API-Key <token>` headers —
 * the latter is the canonical Payload format, but Bearer is friendlier
 * for ad-hoc curl/cron callers.
 */
async function authenticate(
  req: Request,
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<{ ok: boolean }> {
  const raw = req.headers.get('authorization') || ''
  // Normalise Bearer → users API-Key so payload.auth() sees its native format.
  const normalised = raw.replace(/^Bearer\s+/i, 'users API-Key ')
  if (!normalised.startsWith('users API-Key ')) return { ok: false }
  try {
    const headers = new Headers(req.headers)
    headers.set('authorization', normalised)
    const result = await payload.auth({ headers })
    return { ok: Boolean(result?.user) }
  } catch {
    return { ok: false }
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { wpId, filename, mimeType, filesize, alt, width, height } = parsed.data

  try {
    const payload = await getPayload({ config: configPromise })

    const auth = await authenticate(req, payload)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Upsert by wpId. Earlier (failed) migration attempts may have
    // created the doc with a Vercel-Blob-style URL pointing at files
    // that never landed in R2 — overwrite filename/url/sizes so the
    // doc resolves to the now-rcloned R2 path.
    const data = {
      filename,
      mimeType,
      filesize,
      ...(width != null ? { width } : {}),
      ...(height != null ? { height } : {}),
      alt: alt || filename,
      wpId,
      // Clear stale storage state from previous attempts so
      // generateFileURL falls back to the env-configured R2 prefix.
      // - `prefix=null` → URL uses R2_MEDIA_PREFIX env (default 'payload')
      // - `sizes=null` → frontend stops trying to load 404'd thumbnails
      // - `thumbnailURL=null` → admin UI uses the original until we
      //   import WP's resized variants properly
      prefix: null,
      sizes: null,
      thumbnailURL: null,
    }

    const existing = await payload.find({
      collection: 'media',
      where: { wpId: { equals: wpId } },
      limit: 1,
      depth: 0,
    })

    // Low-level DB ops to bypass the upload field validator (which
    // would otherwise demand a `file` body) and skip Payload's image-
    // resize pipeline (WP already produced variants we serve directly
    // from R2).
    const db = payload.db as {
      create: (args: unknown) => Promise<{ id: string | number }>
      updateOne: (args: unknown) => Promise<{ id: string | number }>
    }

    if (existing.docs.length > 0) {
      const id = existing.docs[0].id
      const updated = await db.updateOne({
        collection: 'media',
        where: { id: { equals: id } },
        data,
        req: undefined,
      })
      return NextResponse.json({ id: updated?.id ?? id, updated: true })
    }

    const created = await db.create({
      collection: 'media',
      data,
      req: undefined,
    })

    return NextResponse.json({ id: created.id, created: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[import-r2-media]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
