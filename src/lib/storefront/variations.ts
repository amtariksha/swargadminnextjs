/**
 * Faithful TS ports of swargnodejsbackend's pure variation shapers
 * (src/utils/variations/{attributeMatrix,defaultVariantResolver,backorderResolver}.js).
 *
 * The /api/storefront/* routes here must emit byte-compatible shapes with
 * node.desicowmilk.com's storefront API (the Phase-3 verification gate), so
 * the logic below mirrors the originals 1:1 — including quirks like the
 * 0-price skip in priceRange and the variant-overrides-parent backorder
 * inheritance. Fix bugs THERE first, then re-port.
 */

import type { Row } from './db'

const num = (v: unknown): number => Number(v) || 0

const numberOrNull = (raw: unknown): number | null => {
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const byKeyThenId = (primaryKey: string, secondaryKey: string) => (a: Row, b: Row): number => {
  const ap = num(a[primaryKey])
  const bp = num(b[primaryKey])
  if (ap !== bp) return ap - bp
  return Number(a[secondaryKey]) - Number(b[secondaryKey])
}

export interface AttributeValueOut {
  value_id: unknown
  value: unknown
  slug: unknown
  swatch_color: unknown
  swatch_image_url: unknown
  sort_order: number
}

export interface MatrixOut {
  attributes: Row[]
  display_attributes: Row[]
  variants: Row[]
}

/** Port of buildAttributeMatrix — see attributeMatrix.js for the docs. */
export function buildAttributeMatrix({
  attributeRows,
  valueRows,
  variantRows,
}: {
  attributeRows: Row[]
  valueRows: Row[]
  variantRows: Row[]
}): MatrixOut {
  const variationDefining = (attributeRows || []).filter((a) => Number(a.is_variation_defining) === 1)
  const displayOnly = (attributeRows || []).filter(
    (a) => Number(a.is_variation_defining) !== 1 && Number(a.is_visible) === 1,
  )

  const valuesByAttr = new Map<unknown, AttributeValueOut[]>()
  for (const v of valueRows || []) {
    if (!valuesByAttr.has(v.attribute_id)) valuesByAttr.set(v.attribute_id, [])
    valuesByAttr.get(v.attribute_id)!.push({
      // pg returns BIGINT as a string — emit numeric ids so the storefront
      // VariationSelector (which Number()-compares picks) matches correctly.
      value_id: Number(v.value_id),
      value: v.value,
      slug: v.slug,
      swatch_color: v.swatch_color || null,
      swatch_image_url: v.swatch_image_url || null,
      sort_order: num(v.sort_order),
    })
  }
  for (const list of valuesByAttr.values()) {
    list.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return Number(a.value_id) - Number(b.value_id)
    })
  }

  const attributes = [...variationDefining].sort(byKeyThenId('sort_order', 'attribute_id')).map((a) => ({
    attribute_id: Number(a.attribute_id),
    name: a.name,
    slug: a.slug,
    display_type: a.display_type || 'dropdown',
    sort_order: num(a.sort_order),
    values: valuesByAttr.get(a.attribute_id) || [],
  }))

  const display_attributes = [...displayOnly].sort(byKeyThenId('sort_order', 'attribute_id')).map((a) => ({
    attribute_id: Number(a.attribute_id),
    name: a.name,
    values: valuesByAttr.get(a.attribute_id) || [],
  }))

  const attrMetaById = new Map<unknown, { name: unknown; slug: unknown }>()
  for (const a of attributeRows || []) {
    attrMetaById.set(a.attribute_id, { name: a.name, slug: a.slug })
  }
  const valueMetaById = new Map<unknown, Row>()
  for (const v of valueRows || []) {
    valueMetaById.set(v.value_id, {
      value: v.value,
      slug: v.slug,
      swatch_color: v.swatch_color || null,
      swatch_image_url: v.swatch_image_url || null,
    })
  }

  const variants = (variantRows || []).map((v) => ({
    variant_id: Number(v.id),
    slug: v.slug,
    sku: v.sku || null,
    qty_text: v.qty_text || null,
    regular_price: numberOrNull(v.regular_price),
    sale_price: numberOrNull(v.sale_price),
    sale_starts_at: v.sale_starts_at || null,
    sale_ends_at: v.sale_ends_at || null,
    image_url: v.image_url || null,
    stock_status: v.stock_status || 'in_stock',
    stock_quantity: v.stock_quantity == null ? null : Number(v.stock_quantity),
    allow_back_order: v.allow_back_order == null ? null : Number(v.allow_back_order),
    // Per-variant shipping weight in grams (null when unset).
    weight: numberOrNull(v.weight),
    is_default: Number(v.is_default) === 1,
    attribute_pairs: Array.isArray(v.attribute_pairs)
      ? (v.attribute_pairs as Row[]).map((p) => {
          const valueId = p.attribute_value_id ?? p.value_id ?? null
          const attrMeta = attrMetaById.get(p.attribute_id) || ({} as Row)
          const valueMeta = valueMetaById.get(valueId) || ({} as Row)
          return {
            attribute_id: Number(p.attribute_id),
            attribute_name: (attrMeta as Row).name || '',
            attribute_slug: (attrMeta as Row).slug || null,
            value_id: valueId == null ? null : Number(valueId),
            value: valueMeta.value || '',
            value_slug: valueMeta.slug || null,
            swatch_color: valueMeta.swatch_color || null,
            swatch_image_url: valueMeta.swatch_image_url || null,
          }
        })
      : [],
  }))

  return { attributes, display_attributes, variants }
}

/** Port of pickDefaultVariant — is_default wins, else lowest sort_order/id. */
export function pickDefaultVariant(variants: Row[]): Row | null {
  if (!Array.isArray(variants) || variants.length === 0) return null
  const active = variants.filter((v) => v && Number(v.is_active) === 1 && v.archived_at == null)
  if (active.length === 0) return null
  const explicit = active.find((v) => Number(v.is_default) === 1)
  if (explicit) return explicit
  return [...active].sort((a, b) => {
    const aSort = num(a.sort_order)
    const bSort = num(b.sort_order)
    if (aSort !== bSort) return aSort - bSort
    return Number(a.id) - Number(b.id)
  })[0]
}

/** Port of priceRange — regular_price over active, in-stock-ish variants. */
export function priceRange(variants: Row[]): { min: number | null; max: number | null } {
  if (!Array.isArray(variants) || variants.length === 0) return { min: null, max: null }
  let min: number | null = null
  let max: number | null = null
  for (const v of variants) {
    if (!v || Number(v.is_active) !== 1 || v.archived_at != null) continue
    if (v.stock_status === 'out_of_stock') continue
    const p = Number(v.regular_price)
    if (!Number.isFinite(p) || p <= 0) continue
    if (min == null || p < min) min = p
    if (max == null || p > max) max = p
  }
  return { min, max }
}

const formatDate = (raw: unknown): string | null => {
  if (raw == null || raw === '') return null
  if (raw instanceof Date) return raw.toISOString().slice(0, 10)
  return String(raw).slice(0, 10)
}

export interface BackorderOut {
  allowed: boolean
  nextAvailable: string | null
  source: 'variant' | 'product' | 'none'
}

/** Port of resolveBackorder — variant override (non-NULL) wins over parent. */
export function resolveBackorder({ product, variant }: { product?: Row | null; variant?: Row | null } = {}): BackorderOut {
  const safeProduct = product || ({} as Row)
  const safeVariant = variant || ({} as Row)

  if (safeVariant && safeVariant.allow_back_order != null) {
    const allowed = Number(safeVariant.allow_back_order) === 1
    let nextAvailable = formatDate(safeVariant.back_order_next_available)
    if (allowed && !nextAvailable) {
      nextAvailable = formatDate(safeProduct.back_order_next_available)
    }
    return { allowed, nextAvailable, source: 'variant' }
  }

  if (safeProduct.allow_back_order != null) {
    const allowed = Number(safeProduct.allow_back_order) === 1
    return {
      allowed,
      nextAvailable: formatDate(safeProduct.back_order_next_available),
      source: allowed ? 'product' : 'none',
    }
  }

  return { allowed: false, nextAvailable: null, source: 'none' }
}
