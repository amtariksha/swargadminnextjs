/**
 * GET /api/storefront/products/:slug — public product detail with the full
 * variation matrix (Phase 3). Same envelope as node.desicowmilk.com's
 * getStorefrontProduct:
 *   { response, data: { product, attributes, display_attributes, variants } }
 * PLUS (Phase 2/4 additions on `product`): marketing fields, gallery[],
 * related_product_ids[], delivery_locations[] (location-gate ids; empty =
 * deliverable everywhere).
 *
 * :slug accepts a numeric id (admin preview links) or the URL slug; legacy
 * slugified-title fallback matches the node implementation.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  resolveProduct,
  fetchProductImages,
  fetchMarketingRelations,
  loadVariantPayload,
  formatProductRow,
} from '@/lib/storefront/products'
import { toInt } from '@/lib/storefront/db'

const CACHE = 'public, s-maxage=300, stale-while-revalidate=60'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const product = await resolveProduct(decodeURIComponent(slug || ''))
    if (!product) {
      return NextResponse.json(
        { response: 404, status: false, message: 'Product not found' },
        { status: 404 },
      )
    }

    const productId = toInt(product.id) as number
    const [images, relations, payload] = await Promise.all([
      fetchProductImages(productId),
      fetchMarketingRelations(productId),
      loadVariantPayload(product),
    ])

    const primary = images.find((i) => Number(i.image_type) === 1) || images[0] || null
    const flat = formatProductRow(product)
    flat.image_id = primary ? primary.id : null
    flat.image = primary ? primary.image : null

    const productOut = {
      ...flat,
      images,
      gallery: relations.gallery,
      related_product_ids: relations.related_product_ids,
      delivery_locations: relations.delivery_locations,
      ...(payload
        ? {
            price_range: payload.price_range,
            backorder_effective: payload.backorder_effective,
            default_variant_id: payload.default_variant_id,
          }
        : {}),
    }

    return NextResponse.json(
      {
        response: 200,
        data: {
          product: productOut,
          attributes: payload ? payload.attributes : [],
          display_attributes: payload ? payload.display_attributes : [],
          variants: payload ? payload.variants : [],
        },
      },
      { headers: { 'Cache-Control': CACHE, 'Access-Control-Allow-Origin': '*' } },
    )
  } catch (error) {
    console.error('[storefront/products/:slug] error:', error)
    return NextResponse.json(
      { response: 500, status: false, message: 'Failed to load product' },
      { status: 500 },
    )
  }
}
