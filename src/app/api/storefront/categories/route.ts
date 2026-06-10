/**
 * GET /api/storefront/categories — public category list (Phase 3).
 * formatCategoryData parity + the Phase-2 SEO fields. Images come from the
 * polymorphic app_db.images with table_name LITERAL 'cat' (data value — the
 * table itself is app_db.category).
 */

import { NextResponse } from 'next/server'
import { sfQuery, toInt, toFlag, type Row } from '@/lib/storefront/db'

const CACHE = 'public, s-maxage=300, stale-while-revalidate=60'

export async function GET() {
  try {
    const categories = await sfQuery(
      `SELECT id, title, preferences, slug, description, banner_image,
              meta_title, meta_description, is_active,
              to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
              to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
       FROM app_db.category
       ORDER BY preferences ASC, id ASC`,
    )

    let imagesByCat = new Map<number | null, Row>()
    if (categories.length > 0) {
      const ids = categories.map((c) => toInt(c.id))
      const images = await sfQuery(
        `SELECT id, table_id, image FROM app_db.images
         WHERE table_name = 'cat' AND table_id = ANY($1::bigint[])
         ORDER BY image_type ASC, id ASC`,
        [ids],
      )
      imagesByCat = new Map()
      for (const img of images) {
        const cid = toInt(img.table_id)
        if (!imagesByCat.has(cid)) imagesByCat.set(cid, img)
      }
    }

    const data = categories.map((c) => {
      const img = imagesByCat.get(toInt(c.id))
      return {
        id: toInt(c.id),
        title: c.title,
        preferences: toInt(c.preferences),
        slug: c.slug ?? null,
        description: c.description ?? null,
        banner_image: c.banner_image ?? null,
        meta_title: c.meta_title ?? null,
        meta_description: c.meta_description ?? null,
        is_active: toFlag(c.is_active, 1),
        created_at: c.created_at ?? null,
        updated_at: c.updated_at ?? null,
        image_id: img ? toInt(img.id) : null,
        image: img ? img.image : null,
      }
    })

    return NextResponse.json({ response: 200, data }, { headers: { 'Cache-Control': CACHE } })
  } catch (error) {
    console.error('[storefront/categories] error:', error)
    return NextResponse.json(
      { response: 500, status: false, message: 'Failed to load categories' },
      { status: 500 },
    )
  }
}
