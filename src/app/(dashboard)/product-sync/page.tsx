'use client'

/**
 * Product Sync page — connects MySQL ops products to Payload products so
 * stock can be managed in one place (the existing admin product list).
 *
 * Linkage is via `Payload.mysqlProductId` (already unique-indexed). MySQL
 * is the source of truth for stock; Payload is the web catalog. Edits
 * happen in /products → MySQL → pushed here to Payload.
 *
 * Actions available on this page:
 *   - Auto-link by title (case-insensitive exact match)
 *   - Manual link (pick a Payload product from a dropdown)
 *   - Unlink
 *   - Push stock from MySQL → Payload (per row + bulk)
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Link as LinkIcon, RefreshCw, X, Check, AlertCircle } from 'lucide-react'

import { useProducts, type Product as MysqlProduct } from '@/hooks/useData'
import {
  usePayloadProducts,
  useLinkPayloadProduct,
  useSyncStockToPayload,
  type PayloadProduct,
} from '@/hooks/usePayloadProducts'

type Row = {
  mp: MysqlProduct
  linked: PayloadProduct | undefined
  suggestion: PayloadProduct | undefined
}

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')

const findBestMatch = (
  title: string,
  candidates: PayloadProduct[],
): PayloadProduct | undefined => {
  const target = normalize(title)
  if (!target) return undefined
  // Prefer exact normalized match; fall back to startsWith.
  const exact = candidates.find((c) => normalize(c.title) === target)
  if (exact) return exact
  return candidates.find(
    (c) => normalize(c.title).startsWith(target) || target.startsWith(normalize(c.title)),
  )
}

export default function ProductSyncPage() {
  const { data: mysqlProducts = [], isLoading: msLoading } = useProducts()
  const { data: payloadProducts = [], isLoading: pLoading, refetch } = usePayloadProducts()
  const linkMutation = useLinkPayloadProduct()
  const syncMutation = useSyncStockToPayload()

  const [filter, setFilter] = useState('')
  const [hideLinked, setHideLinked] = useState(false)
  const [busy, setBusy] = useState(false)

  // Index Payload products by the MySQL id they're linked to.
  const linkedByMysqlId = useMemo(() => {
    const m = new Map<number, PayloadProduct>()
    for (const p of payloadProducts) {
      if (p.mysqlProductId != null) m.set(Number(p.mysqlProductId), p)
    }
    return m
  }, [payloadProducts])

  // Payload products NOT yet linked — these are candidates for matching.
  const unlinkedPayload = useMemo(
    () => payloadProducts.filter((p) => p.mysqlProductId == null),
    [payloadProducts],
  )

  // Build the row list.
  const rows: Row[] = useMemo(() => {
    return mysqlProducts.map((mp) => {
      const linked = linkedByMysqlId.get(mp.id)
      const suggestion = linked ? undefined : findBestMatch(mp.title, unlinkedPayload)
      return { mp, linked, suggestion }
    })
  }, [mysqlProducts, linkedByMysqlId, unlinkedPayload])

  const visibleRows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return rows.filter((r) => {
      if (hideLinked && r.linked) return false
      if (!q) return true
      return r.mp.title?.toLowerCase().includes(q) || r.linked?.title.toLowerCase().includes(q)
    })
  }, [rows, filter, hideLinked])

  const linkedCount = rows.filter((r) => r.linked).length
  const suggestionCount = rows.filter((r) => !r.linked && r.suggestion).length

  const handleLink = async (
    mysqlProductId: number,
    payloadProductId: number,
  ) => {
    try {
      await linkMutation.mutateAsync({ payloadProductId, mysqlProductId })
      toast.success('Linked')
    } catch (e) {
      toast.error((e as Error).message || 'Link failed')
    }
  }

  const handleUnlink = async (payloadProductId: number) => {
    try {
      await linkMutation.mutateAsync({ payloadProductId, mysqlProductId: null })
      toast.success('Unlinked')
    } catch (e) {
      toast.error((e as Error).message || 'Unlink failed')
    }
  }

  const handleSyncStock = async (row: Row) => {
    if (!row.linked) {
      toast.error('Not linked yet')
      return
    }
    try {
      await syncMutation.mutateAsync({
        payloadProductId: row.linked.id,
        stockQty: row.mp.stock_qty ?? 0,
      })
      toast.success(`Stock pushed: ${row.mp.stock_qty ?? 0}`)
    } catch (e) {
      toast.error((e as Error).message || 'Sync failed')
    }
  }

  // Bulk: auto-link every row that has a high-confidence suggestion and isn't linked.
  const handleAutoLinkAll = async () => {
    setBusy(true)
    let ok = 0
    let fail = 0
    for (const r of rows) {
      if (r.linked || !r.suggestion) continue
      try {
        await linkMutation.mutateAsync({
          payloadProductId: r.suggestion.id,
          mysqlProductId: r.mp.id,
        })
        ok += 1
      } catch {
        fail += 1
      }
    }
    setBusy(false)
    await refetch()
    if (fail > 0) toast.warning(`Linked ${ok}, failed ${fail}`)
    else toast.success(`Linked ${ok} product(s) by title`)
  }

  // Bulk: push stock for every linked product.
  const handleSyncAllStock = async () => {
    setBusy(true)
    let ok = 0
    let fail = 0
    for (const r of rows) {
      if (!r.linked) continue
      try {
        await syncMutation.mutateAsync({
          payloadProductId: r.linked.id,
          stockQty: r.mp.stock_qty ?? 0,
        })
        ok += 1
      } catch {
        fail += 1
      }
    }
    setBusy(false)
    await refetch()
    if (fail > 0) toast.warning(`Pushed ${ok}, failed ${fail}`)
    else toast.success(`Pushed stock for ${ok} product(s)`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Product Sync</h1>
          <p className="text-slate-400 text-sm">
            Link MySQL operations products to Payload web products so stock changes
            propagate. MySQL is the source of truth.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleAutoLinkAll}
            disabled={busy || suggestionCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-sm font-medium hover:bg-indigo-500/30 disabled:opacity-50"
          >
            <LinkIcon className="w-4 h-4" />
            Auto-link by title ({suggestionCount})
          </button>
          <button
            onClick={handleSyncAllStock}
            disabled={busy || linkedCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl text-sm font-medium hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            Push stock to Payload ({linkedCount} linked)
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="MySQL products" value={mysqlProducts.length} />
        <Stat label="Payload products" value={payloadProducts.length} />
        <Stat label="Linked" value={linkedCount} tone="success" />
        <Stat label="Auto-link suggestions" value={suggestionCount} tone="warn" />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <input
          type="search"
          placeholder="Filter by title…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        />
        <label className="flex items-center gap-2 text-sm text-slate-400 px-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hideLinked}
            onChange={(e) => setHideLinked(e.target.checked)}
            className="accent-purple-500"
          />
          Hide already-linked
        </label>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-x-auto">
        {msLoading || pLoading ? (
          <div className="p-8 text-center text-slate-400">Loading…</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No products match the filter.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 border-b border-slate-700/50">
              <tr>
                <th className="p-3 font-medium">MySQL product</th>
                <th className="p-3 font-medium text-right">Stock</th>
                <th className="p-3 font-medium">Payload product</th>
                <th className="p-3 font-medium text-right">Payload stock</th>
                <th className="p-3 font-medium">Last sync</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.mp.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                  <td className="p-3">
                    <div className="text-white">{r.mp.title}</div>
                    <div className="text-xs text-slate-500">id={r.mp.id}</div>
                  </td>
                  <td className="p-3 text-right text-white">{r.mp.stock_qty ?? '—'}</td>
                  <td className="p-3">
                    {r.linked ? (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="text-white">{r.linked.title}</span>
                        <span className="text-xs text-slate-500">id={r.linked.id}</span>
                      </div>
                    ) : r.suggestion ? (
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span className="text-amber-200">{r.suggestion.title}</span>
                        <span className="text-xs text-amber-500/70">(suggested)</span>
                      </div>
                    ) : (
                      <select
                        className="bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1 text-xs text-white max-w-[260px]"
                        defaultValue=""
                        onChange={(e) => {
                          const id = parseInt(e.target.value, 10)
                          if (Number.isFinite(id)) {
                            void handleLink(r.mp.id, id)
                          }
                        }}
                      >
                        <option value="" disabled>
                          — pick a Payload product —
                        </option>
                        {unlinkedPayload.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-3 text-right text-white">
                    {r.linked?.stockQty ?? '—'}
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {r.linked?.lastSyncedAt
                      ? new Date(r.linked.lastSyncedAt).toLocaleString()
                      : '—'}
                  </td>
                  <td className="p-3 text-right space-x-1 whitespace-nowrap">
                    {r.linked ? (
                      <>
                        <button
                          onClick={() => handleSyncStock(r)}
                          disabled={syncMutation.isPending}
                          title="Push MySQL stock to Payload"
                          className="px-2 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-xs hover:bg-indigo-500/30 disabled:opacity-50"
                        >
                          Sync stock
                        </button>
                        <button
                          onClick={() => handleUnlink(r.linked!.id)}
                          disabled={linkMutation.isPending}
                          title="Unlink"
                          className="px-2 py-1 bg-slate-700/50 text-slate-300 border border-slate-600/50 rounded text-xs hover:bg-slate-700 disabled:opacity-50"
                        >
                          <X className="w-3 h-3 inline" />
                        </button>
                      </>
                    ) : r.suggestion ? (
                      <button
                        onClick={() => handleLink(r.mp.id, r.suggestion!.id)}
                        disabled={linkMutation.isPending}
                        className="px-2 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs hover:bg-amber-500/30 disabled:opacity-50"
                      >
                        Accept link
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'success' | 'warn'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-400'
      : tone === 'warn'
      ? 'text-amber-400'
      : 'text-white'
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  )
}
