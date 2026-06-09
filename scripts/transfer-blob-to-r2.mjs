#!/usr/bin/env node
// =============================================================================
// transfer-blob-to-r2.mjs
// =============================================================================
//
// Copies EVERY object from the Vercel Blob store into the Cloudflare R2
// bucket, preserving the exact pathname under the R2_MEDIA_PREFIX folder so
// Payload's media records (web.media) resolve. Originals AND every Payload
// image-size variant (thumbnail/square/.../og) are copied — we mirror the
// whole store, so nothing is missed.
//
// WHY: the media files Payload references live in Vercel Blob (their filenames
// carry Blob's random suffix). After the R2 storage swap, Payload looks for
// them in R2 under `admin-media/<filename>` and finds nothing → broken images.
// This backfills R2 with those exact keys.
//
// IDEMPOTENT: skips any object already present in R2 (HeadObject). Safe to
// re-run; resumes where it left off.
//
// ── REQUIRED ENV ────────────────────────────────────────────────────────────
//   BLOB_READ_WRITE_TOKEN   from the swargfood Vercel project
//                           (`vercel env pull` or Storage → Blob → .env.local).
//   R2_ENDPOINT             https://<account_id>.r2.cloudflarestorage.com
//   R2_BUCKET               e.g. swarg-media-r2
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_MEDIA_PREFIX         optional, default 'admin-media' (must match
//                           src/plugins/index.ts + web.media.prefix backfill).
//
// ── RUN ─────────────────────────────────────────────────────────────────────
//   cd swarg-admin-nextjs
//   export BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx
//   export R2_ENDPOINT=https://<acct>.r2.cloudflarestorage.com
//   export R2_BUCKET=swarg-media-r2
//   export R2_ACCESS_KEY_ID=xxx
//   export R2_SECRET_ACCESS_KEY=xxx
//   node scripts/transfer-blob-to-r2.mjs
//
// NOTE ON QUOTA: if the Blob store is over the Hobby free tier, listing/reads
// may 403. If you see that, start the Vercel Pro trial (or free space) so the
// store is readable, then re-run — this script only READS Blob, never writes
// to it, so it won't add to your Blob usage.
// =============================================================================

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

const {
  BLOB_READ_WRITE_TOKEN,
  R2_ENDPOINT,
  R2_BUCKET,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_MEDIA_PREFIX = 'admin-media',
} = process.env

function requireEnv(name, val) {
  if (!val) {
    console.error(`\x1b[31m[transfer] missing env: ${name}\x1b[0m`)
    process.exit(1)
  }
}
requireEnv('BLOB_READ_WRITE_TOKEN', BLOB_READ_WRITE_TOKEN)
requireEnv('R2_ENDPOINT', R2_ENDPOINT)
requireEnv('R2_BUCKET', R2_BUCKET)
requireEnv('R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID)
requireEnv('R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY)

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

const log = (m) => console.log(`\x1b[36m[transfer]\x1b[0m ${m}`)
const err = (m) => console.error(`\x1b[31m[transfer]\x1b[0m ${m}`)

// List one page of the Blob store via the REST API (the @vercel/blob `list()`
// wraps this exact endpoint; using fetch avoids adding a dependency).
async function listPage(cursor) {
  const url = new URL('https://blob.vercel-storage.com')
  url.searchParams.set('limit', '1000')
  if (cursor) url.searchParams.set('cursor', cursor)
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${BLOB_READ_WRITE_TOKEN}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Blob list failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`)
  }
  return res.json() // { blobs: [{ url, pathname, size, uploadedAt }], cursor, hasMore }
}

async function existsInR2(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

async function copyOne(blob) {
  const key = `${R2_MEDIA_PREFIX}/${blob.pathname}`
  if (await existsInR2(key)) return 'skip'

  const dl = await fetch(blob.url)
  if (!dl.ok) throw new Error(`download ${blob.pathname} → ${dl.status}`)
  const body = Buffer.from(await dl.arrayBuffer())
  const contentType = dl.headers.get('content-type') || 'application/octet-stream'

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
  return 'copied'
}

async function main() {
  log(`Source: Vercel Blob → Target: R2 ${R2_BUCKET}/${R2_MEDIA_PREFIX}/`)
  let cursor
  let total = 0,
    copied = 0,
    skipped = 0,
    failed = 0
  const failures = []

  do {
    const page = await listPage(cursor)
    for (const blob of page.blobs) {
      total++
      try {
        const r = await copyOne(blob)
        if (r === 'copied') {
          copied++
          if (copied % 25 === 0) log(`copied ${copied}…`)
        } else {
          skipped++
        }
      } catch (e) {
        failed++
        failures.push(`${blob.pathname}: ${e.message}`)
        err(`FAIL ${blob.pathname}: ${e.message}`)
      }
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)

  log(`\n──── done ────`)
  log(`total seen : ${total}`)
  log(`copied     : ${copied}`)
  log(`already in R2 (skipped): ${skipped}`)
  log(`failed     : ${failed}`)
  if (failures.length) {
    err(`\nFailures:\n${failures.slice(0, 50).join('\n')}`)
    process.exit(1)
  }
}

main().catch((e) => {
  err(e.stack || e.message)
  process.exit(1)
})
