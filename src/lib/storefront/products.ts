/**
 * Product queries + shaping for /api/storefront/* (Phase 3).
 *
 * Emits the SAME shapes as node.desicowmilk.com's storefront API
 * (storefrontController + formatProductData + loadVariantPayload +
 * enrichProductListWithVariations), PLUS the Phase-2 marketing fields and the
 * delivery_locations[] gating array. Timestamps/dates are to_char()-cast in
 * SQL so the JSON carries the same IST wall-clock strings as the node API.
 */

import { sfQuery, toInt, toFloat, toFlag, parseJsonb, type Row } from './db'
import { buildAttributeMatrix, pickDefaultVariant, priceRange, resolveBackorder } from './variations'

const TS = (col: string) => `to_char(${col}, 'YYYY-MM-DD HH24:MI:SS')`
const D = (col: string) => `to_char(${col}, 'YYYY-MM-DD')`

/** Columns every product read selects — casts keep JSON shape parity. */
const PRODUCT_COLS = `
  p.id, p.preferences, p.title, p.qty_text, p.stock_qty, p.sub_cat_id,
  p.price, p.tax, p.mrp, p.offer_text, p.description, p.disclaimer,
  p.subscription, p.is_active, p.product_type, p.stock_managed_at,
  p.cost_price, p.slug, p.web_visible, p.delivery_window,
  p.source_intermediate_id, p.pack_volume,
  p.is_returnable_packaging, p.packaging_type_id,
  p.allow_back_order, ${D('p.back_order_next_available')} AS back_order_next_available,
  p.meta_title, p.meta_description, p.meta_image, p.og_title, p.og_description,
  p.og_image, p.long_description, p.featured, p.badge_text, p.ingredients,
  p.nutrition_info, p.wp_id,
  COALESCE(
    (SELECT hr.gst_rate FROM app_db.product_gst_profile pgp
       JOIN app_db.hsn_rate hr ON hr.id = pgp.hsn_rate_id
      WHERE pgp.product_id = p.id LIMIT 1),
    (SELECT og.default_gst_rate FROM app_db.org_gst_profile og ORDER BY og.id LIMIT 1),
    0
  ) AS gst_rate,
  ${TS('p.created_at')} AS created_at, ${TS('p.updated_at')} AS updated_at`

/**
 * Flat product shape — formatProductData parity (key set + types) with the
 * Phase-2 marketing scalars. `images`/`gallery`/etc. are attached by callers.
 */
export function formatProductRow(p: Row): Row {
  return {
    id: toInt(p.id),
    preferences: toInt(p.preferences),
    title: p.title,
    qty_text: p.qty_text || null,
    stock_qty: toInt(p.stock_qty) ?? 0,
    source_intermediate_id: p.source_intermediate_id != null ? toInt(p.source_intermediate_id) : null,
    pack_volume: p.pack_volume != null ? toFloat(p.pack_volume) : null,
    allow_back_order: toFlag(p.allow_back_order),
    back_order_next_available: p.back_order_next_available ?? null,
    delivery_window: p.delivery_window != null ? toInt(p.delivery_window) : 1,
    is_returnable_packaging: toFlag(p.is_returnable_packaging),
    web_visible: toFlag(p.web_visible, 1),
    sub_cat_id: toInt(p.sub_cat_id),
    price: toFloat(p.price),
    tax: toFloat(p.tax),
    // Phase 6 — resolved HSN GST rate % (product.tax is vestigial/0). Drives the
    // web's inclusive CGST/SGST breakup; matches the invoice engine's rate.
    gst_rate: toFloat(p.gst_rate) ?? 0,
    mrp: toFloat(p.mrp),
    // `|| null` (not ??) to match formatProductData's falsy coalescing — an
    // empty string in the DB serialises as null there, so it must here too.
    offer_text: p.offer_text || null,
    description: p.description || null,
    disclaimer: p.disclaimer || null,
    subscription: toInt(p.subscription),
    created_at: p.created_at ?? null,
    updated_at: p.updated_at ?? null,
    is_active: toFlag(p.is_active),
    sub_cat_title: p.sub_cat_title ?? null,
    sub_cat_slug: p.sub_cat_slug ?? null,
    cat_id: toInt(p.cat_id),
    cat_title: p.cat_title ?? null,
    cat_slug: p.cat_slug ?? null,
    product_type: p.product_type || 'simple',
    stock_managed_at: p.stock_managed_at || 'variant',
    cost_price: p.cost_price != null ? toFloat(p.cost_price) : null,
    slug: p.slug || null,
    // Phase 2 — marketing / SEO
    meta_title: p.meta_title || null,
    meta_description: p.meta_description || null,
    meta_image: p.meta_image || null,
    og_title: p.og_title || null,
    og_description: p.og_description || null,
    og_image: p.og_image || null,
    long_description: parseJsonb(p.long_description),
    featured: toFlag(p.featured),
    badge_text: p.badge_text || null,
    ingredients: parseJsonb(p.ingredients),
    nutrition_info: parseJsonb(p.nutrition_info),
    wp_id: p.wp_id ?? null,
    // attached by list/detail callers when loaded
    price_range: p.price_range ?? null,
    swatch_preview: p.swatch_preview ?? null,
    image_id: p.image_id ?? null,
    image: p.image ?? null,
  }
}

/** Port of resolveProduct — numeric :slug = id; slug; legacy title fallback. */
export async function resolveProduct(slugOrId: string): Promise<Row | null> {
  if (!slugOrId) return null
  const base = `SELECT ${PRODUCT_COLS},
                       sc.title AS sub_cat_title, sc.slug AS sub_cat_slug,
                       sc.cat_id, c.title AS cat_title, c.slug AS cat_slug
                FROM app_db.product p
                LEFT JOIN app_db.subcategory sc ON sc.id = p.sub_cat_id
                LEFT JOIN app_db.category c ON c.id = sc.cat_id`
  const visible = `p.is_active = 1 AND COALESCE(p.web_visible, 1) = 1`
  if (/^\d+$/.test(slugOrId)) {
    const rows = await sfQuery(`${base} WHERE p.id = $1 AND ${visible}`, [parseInt(slugOrId, 10)])
    return rows[0] || null
  }
  const bySlug = await sfQuery(`${base} WHERE p.slug = $1 AND ${visible} LIMIT 1`, [slugOrId])
  if (bySlug[0]) return bySlug[0]
  const titleLike = slugOrId.replace(/-/g, ' ')
  const byTitle = await sfQuery(`${base} WHERE LOWER(p.title) = LOWER($1) AND ${visible} LIMIT 1`, [titleLike])
  return byTitle[0] || null
}

/** Polymorphic images for one product (table_name LITERAL 'product'). */
export async function fetchProductImages(productId: number): Promise<Row[]> {
  const rows = await sfQuery(
    `SELECT id, image, image_type FROM app_db.images
     WHERE table_name = 'product' AND table_id = $1
     ORDER BY image_type ASC, id ASC`,
    [productId],
  )
  return rows.map((r) => ({ id: toInt(r.id), image: r.image, image_type: toInt(r.image_type) }))
}

/** Phase-2 relations: gallery filenames, related ids, delivery-location ids. */
export async function fetchMarketingRelations(productId: number): Promise<{
  gallery: unknown[]
  related_product_ids: (number | null)[]
  delivery_locations: (number | null)[]
}> {
  const [g, r, l] = await Promise.all([
    sfQuery(`SELECT image FROM app_db.product_gallery WHERE product_id = $1 ORDER BY sort_order, id`, [productId]),
    sfQuery(`SELECT related_product_id FROM app_db.product_related WHERE product_id = $1 ORDER BY sort_order, id`, [productId]),
    sfQuery(`SELECT delivery_location_id FROM app_db.product_delivery_locations WHERE product_id = $1`, [productId]),
  ])
  return {
    gallery: g.map((x) => x.image),
    related_product_ids: r.map((x) => toInt(x.related_product_id)),
    delivery_locations: l.map((x) => toInt(x.delivery_location_id)),
  }
}

/** Port of loadVariantPayload — null for non-variable products. */
export async function loadVariantPayload(product: Row): Promise<Row | null> {
  if (!product || product.product_type !== 'variable') return null
  const productId = toInt(product.id)

  const attributeRows = await sfQuery(
    `SELECT pa.attribute_id, a.name, a.slug, a.display_type,
            pa.is_variation_defining, pa.is_visible, pa.sort_order
     FROM app_db.product_attribute pa
     JOIN app_db.attribute a ON a.id = pa.attribute_id
     WHERE pa.product_id = $1
     ORDER BY pa.sort_order, pa.id`,
    [productId],
  )

  let valueRows: Row[] = []
  if (attributeRows.length > 0) {
    valueRows = await sfQuery(
      `SELECT pa.attribute_id, pav.attribute_value_id AS value_id,
              av.value, av.slug, av.swatch_color, av.swatch_image_url,
              pav.sort_order
       FROM app_db.product_attribute pa
       JOIN app_db.product_attribute_value pav ON pav.product_attribute_id = pa.id
       JOIN app_db.attribute_value av ON av.id = pav.attribute_value_id
       WHERE pa.product_id = $1 AND av.archived_at IS NULL
       ORDER BY pa.attribute_id, pav.sort_order, av.id`,
      [productId],
    )
  }

  const variantRows = await sfQuery(
    `SELECT id, slug, sku, qty_text, regular_price, sale_price,
            ${TS('sale_starts_at')} AS sale_starts_at, ${TS('sale_ends_at')} AS sale_ends_at,
            cost_price, stock_quantity, manage_stock, stock_status,
            allow_back_order, ${D('back_order_next_available')} AS back_order_next_available,
            image_url, short_description, is_default, sort_order,
            is_active, archived_at
     FROM app_db.variant
     WHERE product_id = $1 AND is_active = 1 AND archived_at IS NULL
     ORDER BY sort_order, id`,
    [productId],
  )

  if (variantRows.length > 0) {
    const ids = variantRows.map((v) => toInt(v.id))
    const pairs = await sfQuery(
      `SELECT variant_id, attribute_id, attribute_value_id
       FROM app_db.variant_attribute_value WHERE variant_id = ANY($1::bigint[])`,
      [ids],
    )
    const byVariant = new Map<number | null, Row[]>()
    for (const p of pairs) {
      const vid = toInt(p.variant_id)
      if (!byVariant.has(vid)) byVariant.set(vid, [])
      byVariant.get(vid)!.push(p)
    }
    for (const v of variantRows) {
      v.attribute_pairs = byVariant.get(toInt(v.id)) || []
    }
  }

  const matrix = buildAttributeMatrix({ attributeRows, valueRows, variantRows })
  const defaultVariant = pickDefaultVariant(variantRows)
  const range = priceRange(variantRows)
  const backorder = resolveBackorder({ product, variant: defaultVariant })

  return {
    attributes: matrix.attributes,
    display_attributes: matrix.display_attributes,
    variants: matrix.variants,
    price_range: range,
    default_variant_id: defaultVariant ? toInt(defaultVariant.id) : null,
    backorder_effective: backorder,
  }
}

/**
 * Port of enrichProductListWithVariations — attaches price_range and the
 * rich swatch_preview chips (with representative variant + prices) to the
 * variable products in a list. Mutates the rows like the original.
 */
export async function enrichListWithVariations(products: Row[]): Promise<void> {
  if (!Array.isArray(products) || products.length === 0) return
  const variableIds = products
    .filter((p) => p && p.product_type === 'variable' && p.id != null)
    .map((p) => toInt(p.id))
  if (variableIds.length === 0) return

  const priceRows = await sfQuery(
    `SELECT product_id, MIN(regular_price) AS min_price, MAX(regular_price) AS max_price
     FROM app_db.variant
     WHERE product_id = ANY($1::bigint[])
       AND is_active = 1 AND archived_at IS NULL
       AND regular_price IS NOT NULL AND regular_price > 0
     GROUP BY product_id`,
    [variableIds],
  )
  const priceByProduct = new Map<number | null, Row>()
  for (const r of priceRows) {
    priceByProduct.set(toInt(r.product_id), {
      min: r.min_price != null ? Number(r.min_price) : null,
      max: r.max_price != null ? Number(r.max_price) : null,
    })
  }

  const swatchRows = await sfQuery(
    `SELECT pa.product_id, a.id AS attribute_id,
            av.id AS value_id, av.value, av.slug,
            av.swatch_color, av.swatch_image_url
     FROM app_db.product_attribute pa
     JOIN app_db.attribute a ON a.id = pa.attribute_id
     JOIN app_db.product_attribute_value pav ON pav.product_attribute_id = pa.id
     JOIN app_db.attribute_value av ON av.id = pav.attribute_value_id
     WHERE pa.product_id = ANY($1::bigint[])
       AND pa.is_variation_defining = 1
       AND av.archived_at IS NULL
     ORDER BY pa.product_id, a.sort_order, av.sort_order, av.id`,
    [variableIds],
  )
  const swatchByProduct = new Map<number | null, Row[]>()
  const firstAttrByProduct = new Map<number | null, unknown>()
  for (const r of swatchRows) {
    const pid = toInt(r.product_id)
    if (!firstAttrByProduct.has(pid)) firstAttrByProduct.set(pid, r.attribute_id)
    if (r.attribute_id !== firstAttrByProduct.get(pid)) continue
    const arr = swatchByProduct.get(pid) || []
    arr.push({
      value_id: toInt(r.value_id),
      value: r.value,
      slug: r.slug,
      swatch_color: r.swatch_color || null,
      swatch_image_url: r.swatch_image_url || null,
    })
    swatchByProduct.set(pid, arr)
  }

  const variantsForProducts = await sfQuery(
    `SELECT v.id AS variant_id, v.product_id, v.regular_price, v.sale_price,
            v.stock_status, v.is_default, v.sort_order, vav.attribute_value_id
     FROM app_db.variant v
     JOIN app_db.variant_attribute_value vav ON vav.variant_id = v.id
     WHERE v.product_id = ANY($1::bigint[])
       AND v.is_active = 1 AND v.archived_at IS NULL
     ORDER BY v.product_id, v.sort_order, v.id`,
    [variableIds],
  )
  const variantsByValue = new Map<number | null, Map<number | null, Row[]>>()
  for (const r of variantsForProducts) {
    const pid = toInt(r.product_id)
    let perProduct = variantsByValue.get(pid)
    if (!perProduct) {
      perProduct = new Map()
      variantsByValue.set(pid, perProduct)
    }
    const vid = toInt(r.attribute_value_id)
    const arr = perProduct.get(vid) || []
    arr.push(r)
    perProduct.set(vid, arr)
  }

  for (const p of products) {
    if (p.product_type !== 'variable') continue
    const pid = toInt(p.id)
    const range = priceByProduct.get(pid)
    if (range) p.price_range = range
    const swatches = swatchByProduct.get(pid)
    if (!swatches || swatches.length === 0) continue
    const perValue = variantsByValue.get(pid)
    for (const s of swatches) {
      const candidates = perValue ? perValue.get(s.value_id as number | null) || [] : []
      const inStock = candidates.find((c) => c.stock_status === 'in_stock')
      const chosen = inStock || candidates[0]
      if (chosen) {
        s.variant_id = toInt(chosen.variant_id)
        s.regular_price = chosen.regular_price != null ? Number(chosen.regular_price) : null
        s.sale_price = chosen.sale_price != null ? Number(chosen.sale_price) : null
        s.stock_status = chosen.stock_status || 'in_stock'
      }
    }
    p.swatch_preview = swatches
  }
}

export { PRODUCT_COLS }
