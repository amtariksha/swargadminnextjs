/**
 * GET /api/storefront/products — public, variation-aware product listing for
 * swargfooddotcom (Phase 3). Mirrors node.desicowmilk.com's
 * listStorefrontProducts (filters: attribute_value_ids, sub_cat_id, cat_id, q,
 * limit/offset) PLUS:
 *   - web_visible gating (marketing-site visibility, Feature 20)
 *   - ?location=<id> gating via app_db.product_delivery_locations (Phase 4 UX):
 *     products with NO location rows are deliverable everywhere; rows narrow it.
 *
 * Reads app_db.* directly through the Payload PG pool — never node.desicowmilk.com.
 * CDN-cacheable; the query string (incl. location) is the cache key.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sfQuery, toInt, type Row } from '@/lib/storefront/db'
import { PRODUCT_COLS, enrichListWithVariations, formatProductRow } from '@/lib/storefront/products'

const CACHE = 'public, s-maxage=300, stale-while-revalidate=60'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const limit = Math.min(parseInt(sp.get('limit') || '', 10) || 50, 200)
    const offset = Math.max(parseInt(sp.get('offset') || '', 10) || 0, 0)
    const subCatId = toInt(sp.get('sub_cat_id'))
    const catId = toInt(sp.get('cat_id'))
    const locationId = toInt(sp.get('location'))
    const q = (sp.get('q') || '').trim()
    const attrValueIds = (sp.get('attribute_value_ids') || '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n))

    const params: unknown[] = []
    let where = `p.is_active = 1 AND COALESCE(p.web_visible, 1) = 1`

    // Attribute filter — OR within an attribute, AND (INTERSECT) across.
    if (attrValueIds.length > 0) {
      params.push(attrValueIds)
      const valueRows = await sfQuery(
        `SELECT id, attribute_id FROM app_db.attribute_value WHERE id = ANY($1::bigint[])`,
        params,
      )
      // Intentional reset: the query above was a pre-lookup with its own $1;
      // the main WHERE's $1..$n series is rebuilt from scratch below. Keep any
      // new filter pushes BELOW this line or the placeholder numbering desyncs.
      params.length = 0
      const byAttr = new Map<unknown, number[]>()
      for (const r of valueRows) {
        const k = String(r.attribute_id)
        if (!byAttr.has(k)) byAttr.set(k, [])
        byAttr.get(k)!.push(toInt(r.id) as number)
      }
      if (byAttr.size > 0) {
        const intersects: string[] = []
        for (const ids of byAttr.values()) {
          params.push(ids)
          intersects.push(
            `SELECT v.product_id FROM app_db.variant v
             JOIN app_db.variant_attribute_value vav ON vav.variant_id = v.id
             WHERE v.is_active = 1 AND v.archived_at IS NULL
               AND v.stock_status = 'in_stock'
               AND vav.attribute_value_id = ANY($${params.length}::bigint[])`,
          )
        }
        where += ` AND p.id IN (${intersects.join(' INTERSECT ')})`
      }
    }

    if (subCatId != null) {
      params.push(subCatId)
      where += ` AND p.sub_cat_id = $${params.length}`
    }
    if (catId != null) {
      params.push(catId)
      where += ` AND p.sub_cat_id IN (SELECT id FROM app_db.subcategory WHERE cat_id = $${params.length})`
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`)
      where += ` AND LOWER(p.title) LIKE $${params.length}`
    }
    if (locationId != null) {
      params.push(locationId)
      where += ` AND (
        NOT EXISTS (SELECT 1 FROM app_db.product_delivery_locations pdl WHERE pdl.product_id = p.id)
        OR EXISTS (SELECT 1 FROM app_db.product_delivery_locations pdl
                   WHERE pdl.product_id = p.id AND pdl.delivery_location_id = $${params.length})
      )`
    }

    const products = await sfQuery(
      `SELECT ${PRODUCT_COLS}, sc.title AS sub_cat_title, sc.cat_id, c.title AS cat_title
       FROM app_db.product p
       LEFT JOIN app_db.subcategory sc ON sc.id = p.sub_cat_id
       LEFT JOIN app_db.category c ON c.id = sc.cat_id
       WHERE ${where}
       ORDER BY p.preferences ASC, p.id ASC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    )

    // Featured image (image_type=1) — table_name LITERAL 'product'.
    if (products.length > 0) {
      const ids = products.map((p) => toInt(p.id))
      const images = await sfQuery(
        `SELECT id, table_id, image, image_type FROM app_db.images
         WHERE table_name = 'product' AND table_id = ANY($1::bigint[])
         ORDER BY image_type ASC, id ASC`,
        [ids],
      )
      const mainByProduct = new Map<number | null, Row>()
      for (const img of images) {
        const pid = toInt(img.table_id)
        if (!mainByProduct.has(pid) && Number(img.image_type) === 1) mainByProduct.set(pid, img)
      }
      for (const p of products) {
        const main = mainByProduct.get(toInt(p.id))
        if (main) {
          p.image = main.image
          p.image_id = toInt(main.id)
        }
      }
    }

    await enrichListWithVariations(products)

    const totalRows = await sfQuery(
      `SELECT COUNT(*) AS total FROM app_db.product p WHERE ${where}`,
      params,
    )

    return NextResponse.json(
      {
        response: 200,
        data: products.map(formatProductRow),
        meta: {
          total: Number(totalRows?.[0]?.total ?? 0),
          limit,
          offset,
          filters: { attribute_value_ids: attrValueIds, sub_cat_id: subCatId, cat_id: catId, q, location: locationId },
        },
      },
      { headers: { 'Cache-Control': CACHE } },
    )
  } catch (error) {
    console.error('[storefront/products] list error:', error)
    return NextResponse.json(
      { response: 500, status: false, message: 'Failed to load products' },
      { status: 500 },
    )
  }
}
