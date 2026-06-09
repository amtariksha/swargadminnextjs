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
 * Auth: bearer token equal to PAYLOAD_API_TOKEN (the same service-account
 * key used by the WP migration writer).
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

function isAuthorized(req: Request): boolean {
  const expected = process.env.PAYLOAD_API_TOKEN
  if (!expected) return false
  const auth = req.headers.get('authorization') || ''
  return (
    auth === `Bearer ${expected}` || auth === `users API-Key ${expected}`
  )
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

    // Idempotency: skip if already imported.
    const existing = await payload.find({
      collection: 'media',
      where: { wpId: { equals: wpId } },
      limit: 1,
      depth: 0,
    })
    if (existing.docs.length > 0) {
      return NextResponse.json({ id: existing.docs[0].id, skipped: 'exists' })
    }

    // Low-level DB insert: bypasses the upload validator (which would
    // refuse a doc with no file) and skips Payload's own image-resize
    // pipeline (we don't want or need it — WP already produced variants).
    const created = await (payload.db as { create: (args: unknown) => Promise<{ id: string | number }> }).create({
      collection: 'media',
      data: {
        filename,
        mimeType,
        filesize,
        ...(width != null ? { width } : {}),
        ...(height != null ? { height } : {}),
        alt: alt || filename,
        wpId,
      },
      req: undefined,
    })

    return NextResponse.json({ id: created.id, created: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[import-r2-media]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
