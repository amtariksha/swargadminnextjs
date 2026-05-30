/**
 * usePayloadProducts — fetches the Payload `products` collection via its
 * REST API. Distinct from `useProducts()` (which talks to the MySQL ops
 * backend via swargnodejsbackend). Used by the /product-sync page that
 * links MySQL → Payload products and mirrors stock.
 *
 * Payload's REST API on this admin auto-authenticates via the
 * swarg_admin_token cookie (set by /login through the JWT bridge), so no
 * extra auth header is needed when called from the admin browser session.
 */
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface PayloadProduct {
  id: number
  title: string
  slug?: string
  mysqlProductId?: number | null
  stockQty?: number
  inStock?: boolean
  stockStatus?: string
  price?: number
  mrp?: number
  salePrice?: number
  displayWeight?: string
  weight?: number
  isActive?: boolean
  lastSyncedAt?: string | null
}

interface PayloadList<T> {
  docs: T[]
  totalDocs: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

/**
 * Fetch all Payload products (paginated under the hood).
 * For ~150 products this is one request; for larger catalogues it
 * loops until hasNextPage=false.
 */
async function fetchAllPayloadProducts(): Promise<PayloadProduct[]> {
  const out: PayloadProduct[] = []
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(
      `/api/products?depth=0&limit=200&page=${page}&sort=title`,
      { credentials: 'include' },
    )
    if (!res.ok) {
      throw new Error(`Payload /api/products returned ${res.status}`)
    }
    const json = (await res.json()) as PayloadList<PayloadProduct>
    out.push(...json.docs)
    if (!json.hasNextPage) break
    page += 1
    if (page > 50) break // defensive cap
  }
  return out
}

export function usePayloadProducts() {
  return useQuery({
    queryKey: ['payload-products'],
    queryFn: fetchAllPayloadProducts,
    staleTime: 30_000,
  })
}

interface LinkArgs {
  payloadProductId: number
  mysqlProductId: number | null
}

interface SyncStockArgs {
  payloadProductId: number
  stockQty: number
}

export interface SyncFieldsArgs {
  payloadProductId: number
  /** New stock count. */
  stockQty?: number
  /** Sale price (MySQL `price`). */
  price?: number
  /** MRP (MySQL `mrp`). */
  mrp?: number
  /** Display weight string (MySQL `qty_text`). */
  displayWeight?: string
  /** Active flag (MySQL `is_active`). */
  isActive?: boolean
  /**
   * Feature 20 Phase 2 — Payload's `platformVisibility` enum, derived from
   * the backend's `web_visible` toggle. ON → `'both'` (visible on web+app),
   * OFF → `'app_only'` (hidden on web). `'web_only'` is rare and stays
   * editable only via Payload's own UI.
   */
  platformVisibility?: 'both' | 'web_only' | 'app_only'
}

/**
 * Mutation: update a Payload product's `mysqlProductId` (link/unlink) or
 * `stockQty` + `lastSyncedAt` (sync). Both go through Payload's REST PATCH
 * endpoint with the same auth bridge.
 */
async function patchPayloadProduct(
  id: number,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PATCH /api/products/${id} ${res.status}: ${text.slice(0, 200)}`)
  }
}

export function useLinkPayloadProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ payloadProductId, mysqlProductId }: LinkArgs) => {
      await patchPayloadProduct(payloadProductId, { mysqlProductId })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payload-products'] }),
  })
}

export function useSyncStockToPayload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ payloadProductId, stockQty }: SyncStockArgs) => {
      await patchPayloadProduct(payloadProductId, {
        stockQty,
        inStock: stockQty > 0,
        stockStatus: stockQty > 0 ? 'in_stock' : 'out_of_stock',
        lastSyncedAt: new Date().toISOString(),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payload-products'] }),
  })
}

/**
 * Pushes multiple MySQL-side fields to Payload in one PATCH. Only the
 * fields included in `args` are sent — undefined keys are omitted.
 * Always stamps `lastSyncedAt` on success.
 */
export function useSyncFieldsToPayload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: SyncFieldsArgs) => {
      const body: Record<string, unknown> = {
        lastSyncedAt: new Date().toISOString(),
      }
      if (args.stockQty !== undefined) {
        body.stockQty = args.stockQty
        body.inStock = args.stockQty > 0
        body.stockStatus = args.stockQty > 0 ? 'in_stock' : 'out_of_stock'
      }
      if (args.price !== undefined) body.price = args.price
      if (args.mrp !== undefined) body.mrp = args.mrp
      if (args.displayWeight !== undefined) body.displayWeight = args.displayWeight
      if (args.isActive !== undefined) body.isActive = args.isActive
      if (args.platformVisibility !== undefined) body.platformVisibility = args.platformVisibility

      await patchPayloadProduct(args.payloadProductId, body)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payload-products'] }),
  })
}
