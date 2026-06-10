/**
 * GET /api/storefront/delivery-locations — public list of delivery locations
 * the swargfooddotcom customer can pick from (Phase 3/4 location gate).
 * Backed by app_db.available_delivery_location (the admin "Delivery
 * Locations" page manages it).
 */

import { NextResponse } from 'next/server'
import { sfQuery, toInt } from '@/lib/storefront/db'

const CACHE = 'public, s-maxage=300, stale-while-revalidate=60'

export async function GET() {
  try {
    const rows = await sfQuery(
      `SELECT id, title FROM app_db.available_delivery_location ORDER BY id ASC`,
    )
    return NextResponse.json(
      { response: 200, data: rows.map((r) => ({ id: toInt(r.id), title: r.title })) },
      { headers: { 'Cache-Control': CACHE } },
    )
  } catch (error) {
    console.error('[storefront/delivery-locations] error:', error)
    return NextResponse.json(
      { response: 500, status: false, message: 'Failed to load delivery locations' },
      { status: 500 },
    )
  }
}
