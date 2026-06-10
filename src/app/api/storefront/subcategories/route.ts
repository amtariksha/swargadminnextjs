/**
 * GET /api/storefront/subcategories[?cat_id=N] — public subcategory list
 * (Phase 3). formatSubCategoryData parity + Phase-2 SEO fields. Images come
 * from app_db.images with table_name LITERAL 'sub_cat' (data value — the
 * table itself is app_db.subcategory).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sfQuery, toInt, type Row } from '@/lib/storefront/db'

const CACHE = 'public, s-maxage=300, stale-while-revalidate=60'

export async function GET(req: NextRequest) {
  try {
    const catId = toInt(req.nextUrl.searchParams.get('cat_id'))
    const params: unknown[] = []
    let where = ''
    if (catId != null) {
      params.push(catId)
      where = `WHERE sc.cat_id = $${params.length}`
    }

    const subcategories = await sfQuery(
      `SELECT sc.id, sc.cat_id, sc.title, sc.preferences, sc.slug, sc.description,
              sc.banner_image, sc.meta_title, sc.meta_description,
              to_char(sc.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
              to_char(sc.updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at,
              c.title AS cat_title
       FROM app_db.subcategory sc
       LEFT JOIN app_db.category c ON c.id = sc.cat_id
       ${where}
       ORDER BY sc.preferences ASC, sc.id ASC`,
      params,
    )

    let imagesBySubcat = new Map<number | null, Row>()
    if (subcategories.length > 0) {
      const ids = subcategories.map((s) => toInt(s.id))
      const images = await sfQuery(
        `SELECT id, table_id, image FROM app_db.images
         WHERE table_name = 'sub_cat' AND table_id = ANY($1::bigint[])
         ORDER BY image_type ASC, id ASC`,
        [ids],
      )
      imagesBySubcat = new Map()
      for (const img of images) {
        const sid = toInt(img.table_id)
        if (!imagesBySubcat.has(sid)) imagesBySubcat.set(sid, img)
      }
    }

    const data = subcategories.map((s) => {
      const img = imagesBySubcat.get(toInt(s.id))
      return {
        id: toInt(s.id),
        cat_id: toInt(s.cat_id),
        title: s.title,
        preferences: toInt(s.preferences),
        slug: s.slug ?? null,
        description: s.description ?? null,
        banner_image: s.banner_image ?? null,
        meta_title: s.meta_title ?? null,
        meta_description: s.meta_description ?? null,
        created_at: s.created_at ?? null,
        updated_at: s.updated_at ?? null,
        cat_title: s.cat_title ?? null,
        image_id: img ? toInt(img.id) : null,
        image: img ? img.image : null,
      }
    })

    return NextResponse.json({ response: 200, data }, { headers: { 'Cache-Control': CACHE } })
  } catch (error) {
    console.error('[storefront/subcategories] error:', error)
    return NextResponse.json(
      { response: 500, status: false, message: 'Failed to load subcategories' },
      { status: 500 },
    )
  }
}
