/**
 * GET /api/storefront/order-tracking?order_id=<id>&phone=<10-digit>
 *
 * Phase 4 — public, phone-gated day-order status lookup for swargfood.com's
 * /track-order page. The phone must match the order's customer (primary
 * phone, last 10 digits) or the lookup 404s — same anti-enumeration stance
 * as the legacy web tracker. Never cached.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sfQuery, toInt, toFloat, toStr } from '@/lib/storefront/db'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const orderId = toInt(sp.get('order_id'))
    const phone = (sp.get('phone') || '').replace(/\D/g, '').slice(-10)
    if (orderId == null || phone.length !== 10) {
      return NextResponse.json(
        { response: 400, status: false, message: 'order_id and a 10-digit phone are required' },
        { status: 400 },
      )
    }

    const rows = await sfQuery(
      `SELECT o.id, o.order_no, o.order_status, o.payment_status, o.total_amount,
              o.delivery_address,
              to_char(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
              to_char(o.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
              u.phone AS customer_phone, u.name AS customer_name
       FROM app_db.daytime_order o
       JOIN app_db.users u ON u.id = o.user_id
       WHERE o.id = $1
       LIMIT 1`,
      [orderId],
    )
    const order = rows[0]
    const orderPhone = String(order?.customer_phone || '').replace(/\D/g, '').slice(-10)
    if (!order || orderPhone !== phone) {
      // Existence is not leaked on a phone mismatch.
      return NextResponse.json(
        { response: 404, status: false, message: 'Order not found' },
        { status: 404 },
      )
    }

    const items = await sfQuery(
      `SELECT i.qty, i.unit_price, i.line_total, p.title
       FROM app_db.daytime_order_item i
       LEFT JOIN app_db.product p ON p.id = i.product_id
       WHERE i.daytime_order_id = $1
       ORDER BY i.id`,
      [orderId],
    )

    return NextResponse.json(
      {
        response: 200,
        data: {
          order_id: toInt(order.id),
          order_no: toInt(order.order_no),
          order_status: toStr(order.order_status),
          payment_status: toStr(order.payment_status),
          total_amount: toFloat(order.total_amount),
          delivery_date: order.delivery_date ?? null,
          delivery_address: toStr(order.delivery_address),
          created_at: order.created_at ?? null,
          items: items.map((i) => ({
            title: toStr(i.title) || 'Item',
            qty: toFloat(i.qty) ?? 1,
            unit_price: toFloat(i.unit_price) ?? 0,
            line_total: toFloat(i.line_total) ?? 0,
          })),
        },
      },
      // No CORS header on purpose: the response carries PII (address, name)
      // and swargfooddotcom consumes this server-side only.
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[storefront/order-tracking] error:', error)
    return NextResponse.json(
      { response: 500, status: false, message: 'Lookup failed' },
      { status: 500 },
    )
  }
}
