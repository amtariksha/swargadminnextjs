/**
 * WS-1 — Posts/Pages content recovery from the WordPress backup.
 *
 * The legacy WP→Payload import dumped raw `post_content` (Gutenberg + Flatsome
 * shortcodes) into a single Lexical text node and never migrated images, and
 * the real ~3 posts / 5 content pages exist as duplicate rows. This one-shot,
 * idempotent script faithfully recovers them:
 *   • WP HTML → proper Lexical (scripts/wp-recovery/html-to-lexical.ts)
 *   • [ux_image id=N] images → uploaded to Media (R2) → MediaBlock nodes
 *   • first image becomes the post heroImage (WP had no featured images)
 *   • UPSERT by wpId onto the canonical clean slug; DELETE the duplicate twins
 *
 * SAFE BY DEFAULT: runs in DRY-RUN (prints the plan, writes nothing). Pass
 * `--commit` to write. Reads WP via `docker exec` against the local backup
 * container; writes to whatever Payload DATABASE_URI the operator has set.
 *
 * Run:
 *   pnpm recover:wp            # dry-run
 *   pnpm recover:wp -- --commit
 * Env: WP_DOCKER_CONTAINER (swargwp-db), WP_UPLOADS_DIR
 *      (/mnt/work/backups/swargfood-wp-archive/wp-content/uploads)
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

import { getPayload } from 'payload'
import config from '@payload-config'

import { htmlToLexical } from './wp-recovery/html-to-lexical'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DRY_RUN = !process.argv.includes('--commit')
const ONLY = (process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] || 'all') as
  | 'all'
  | 'posts'
  | 'pages'

const WP_CONTAINER = process.env.WP_DOCKER_CONTAINER || 'swargwp-db'
const WP_DB = process.env.WP_DB || 'wordpress'
const WP_USER = process.env.WP_USER || 'root'
const WP_PW = process.env.WP_PW || 'localref'
const UPLOADS_DIR =
  process.env.WP_UPLOADS_DIR || '/mnt/work/backups/swargfood-wp-archive/wp-content/uploads'

// In-scope items (clean canonical slug → WP source id). Everything else in WP
// is now a code route on swargfooddotcom and is intentionally NOT recovered.
// `aliases` = other slugs the same logical doc exists under (variant dupes the
// wpId / -wp-N candidate query wouldn't otherwise catch).
interface Item {
  wpId: number
  slug: string
  aliases?: string[]
}
const POSTS: Item[] = [
  { wpId: 2632, slug: 'forest-grazing-v-s-grass-fed', aliases: ['forest-grazing-vs-grass-fed'] },
  { wpId: 3461, slug: 'raw-vs-pasteurized-milk' },
  { wpId: 777, slug: 'swargs-full-moon-ghee' },
]
const PAGES: Item[] = [
  { wpId: 211, slug: 'about' },
  { wpId: 3, slug: 'privacy-policy' },
  { wpId: 120, slug: 'terms-and-conditions' },
  { wpId: 11, slug: 'refund-policy' },
  { wpId: 4597, slug: 'account-deletion-request' },
]

// ---------------------------------------------------------------------------
// WP backup access (read-only, via docker exec)
// ---------------------------------------------------------------------------
function wp(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', WP_CONTAINER, 'mysql', `-u${WP_USER}`, `-p${WP_PW}`, WP_DB, '-N', '-r', '-e', sql],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
}

function wpPost(id: number): { title: string; content: string; date: string } {
  const title = wp(`SELECT post_title FROM wp_posts WHERE ID=${id}`).trim()
  const content = wp(`SELECT post_content FROM wp_posts WHERE ID=${id}`)
  const date = wp(`SELECT post_date FROM wp_posts WHERE ID=${id}`).trim()
  return { title, content, date }
}

function wpAttachmentFile(attId: number): string | null {
  const f = wp(
    `SELECT meta_value FROM wp_postmeta WHERE post_id=${attId} AND meta_key='_wp_attached_file' LIMIT 1`,
  ).trim()
  return f || null
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

// ---------------------------------------------------------------------------
// Media upload (idempotent by filename)
// ---------------------------------------------------------------------------
type AnyPayload = Awaited<ReturnType<typeof getPayload>>

const mediaCache = new Map<number, string | number | null>()

async function uploadMedia(
  payload: AnyPayload,
  attId: number,
  altBase: string,
): Promise<string | number | null> {
  if (mediaCache.has(attId)) return mediaCache.get(attId)!

  const rel = wpAttachmentFile(attId)
  if (!rel) {
    console.warn(`    ⚠ attachment ${attId}: no _wp_attached_file`)
    mediaCache.set(attId, null)
    return null
  }
  const abs = join(UPLOADS_DIR, rel)
  if (!existsSync(abs)) {
    console.warn(`    ⚠ attachment ${attId}: file missing on disk (${rel})`)
    mediaCache.set(attId, null)
    return null
  }
  const fname = basename(rel)
  const mimetype = MIME[extname(fname).toLowerCase()] || 'application/octet-stream'

  if (DRY_RUN) {
    mediaCache.set(attId, `DRY:${attId}`)
    return `DRY:${attId}`
  }

  // Reuse an existing media doc with the same filename (idempotent re-runs).
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: fname } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  if (existing.docs[0]) {
    mediaCache.set(attId, existing.docs[0].id)
    return existing.docs[0].id
  }

  const data = readFileSync(abs)
  const doc = await payload.create({
    collection: 'media',
    data: { alt: altBase } as never,
    file: { name: fname, data, mimetype, size: data.byteLength },
    overrideAccess: true,
  })
  mediaCache.set(attId, doc.id)
  return doc.id
}

// ---------------------------------------------------------------------------
// Upsert + dedup (canonical clean slug, keyed on wpId)
// ---------------------------------------------------------------------------
async function findCandidates(
  payload: AnyPayload,
  collection: 'posts' | 'pages',
  item: Item,
) {
  const slugs = [item.slug, `${item.slug}-wp-${item.wpId}`, ...(item.aliases || [])]
  const res = await payload.find({
    collection,
    where: {
      or: [{ slug: { in: slugs } }, { wpId: { equals: String(item.wpId) } }],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    draft: true,
  })
  return res.docs as Array<{ id: string | number; slug?: string; wpId?: string }>
}

async function recover(payload: AnyPayload, collection: 'posts' | 'pages', item: Item) {
  const { title, content, date } = wpPost(item.wpId)
  console.log(`\n[${collection}] ${item.slug}  (wpId ${item.wpId}) — "${title}"`)

  // Pass 1: discover image attachment ids.
  const pass1 = htmlToLexical(content)
  const imageIds = pass1.imageWpIds
  console.log(`    blocks=${(pass1.root.root.children as unknown[]).length}  images=${imageIds.length}`)

  // Upload images → wpId→mediaId map; first becomes the hero (posts only).
  const map = new Map<number, string | number | null>()
  for (const att of imageIds) map.set(att, await uploadMedia(payload, att, title))
  const heroId = collection === 'posts' ? [...map.values()].find((v) => v && !String(v).startsWith('DRY')) : undefined

  // Pass 2: real Lexical with MediaBlock nodes.
  const lexical = htmlToLexical(content, (att) => map.get(att) ?? null).root

  // Build collection-specific data.
  const base: Record<string, unknown> = {
    title,
    slug: item.slug,
    wpId: String(item.wpId),
    _status: 'published',
  }
  if (collection === 'posts') {
    base.content = lexical
    if (heroId) base.heroImage = heroId
    if (date && date !== '0000-00-00 00:00:00') base.publishedAt = new Date(date.replace(' ', 'T')).toISOString()
  } else {
    base.layout = [{ blockType: 'content', columns: [{ size: 'full', richText: lexical }] }]
  }

  // Resolve canonical doc + duplicates.
  const cands = await findCandidates(payload, collection, item)
  const canonical =
    cands.find((d) => d.slug === item.slug) ||
    cands.find((d) => d.slug === `${item.slug}-wp-${item.wpId}`) ||
    cands.find((d) => String(d.wpId) === String(item.wpId)) ||
    null
  const dups = cands.filter((d) => d !== canonical)

  console.log(
    `    canonical=${canonical ? `id ${canonical.id} (slug ${canonical.slug})` : 'NEW'}` +
      `  delete-dups=[${dups.map((d) => `${d.id}:${d.slug}`).join(', ') || 'none'}]` +
      (heroId ? `  hero=media:${heroId}` : ''),
  )

  if (DRY_RUN) return

  // Delete dups first (frees the clean slug), then upsert canonical.
  for (const d of dups) {
    await payload.delete({ collection, id: d.id, overrideAccess: true })
  }
  if (canonical) {
    await payload.update({ collection, id: canonical.id, data: base as never, overrideAccess: true })
    console.log(`    ✓ updated id ${canonical.id}`)
  } else {
    const created = await payload.create({ collection, data: base as never, overrideAccess: true })
    console.log(`    ✓ created id ${created.id}`)
  }
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(
    `\n=== WP content recovery — ${DRY_RUN ? 'DRY RUN (no writes)' : 'COMMIT (writing to Payload)'} — scope: ${ONLY} ===`,
  )
  console.log(`WP container: ${WP_CONTAINER}  uploads: ${UPLOADS_DIR}`)

  const payload = await getPayload({ config })

  if (ONLY === 'all' || ONLY === 'posts') {
    for (const p of POSTS) await recover(payload, 'posts', p)
  }
  if (ONLY === 'all' || ONLY === 'pages') {
    for (const p of PAGES) await recover(payload, 'pages', p)
  }

  console.log(
    `\n=== ${DRY_RUN ? 'DRY RUN complete — re-run with `-- --commit` to apply.' : 'Recovery complete.'} ===\n`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error('\n✗ Recovery failed:', err)
  process.exit(1)
})
