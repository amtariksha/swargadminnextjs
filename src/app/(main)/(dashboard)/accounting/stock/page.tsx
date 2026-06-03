'use client';

import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';

interface RawStock { id: number; name: string; unit: string; current_stock: number | string; unit_value: number | string; stock_value: number | string }
interface IntStock { id: number; name: string; base_unit: string; current_stock: number | string }
interface StockValuation { raw_materials: RawStock[]; intermediates: IntStock[]; total_raw_value: number | string }

export default function StockValuationPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'stock-valuation'],
    queryFn: async () => (await GET<StockValuation>('/accounting/stock-valuation')).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Stock &amp; Valuation</h1>
        <p className="text-slate-400">
          Derived from current stock — non-mandatory. Raw materials valued at default / average purchase price.
        </p>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="glass rounded-xl p-4">
            <p className="text-sm text-slate-400">Raw-material stock value</p>
            <p className="text-2xl font-bold text-cyan-400">₹{Number(data?.total_raw_value ?? 0).toFixed(2)}</p>
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-4 py-2 text-sm font-semibold text-white bg-slate-800/40">Raw materials</div>
            <table className="w-full text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-right px-4 py-2">Stock</th>
                  <th className="text-right px-4 py-2">Unit value</th>
                  <th className="text-right px-4 py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {(data?.raw_materials ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-slate-800/50 text-slate-200">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2 text-right">{Number(r.current_stock)} {r.unit}</td>
                    <td className="px-4 py-2 text-right">₹{Number(r.unit_value).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right text-cyan-400">₹{Number(r.stock_value).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-4 py-2 text-sm font-semibold text-white bg-slate-800/40">Intermediates (WIP)</div>
            <table className="w-full text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-right px-4 py-2">Stock</th>
                </tr>
              </thead>
              <tbody>
                {(data?.intermediates ?? []).map((m) => (
                  <tr key={m.id} className="border-t border-slate-800/50 text-slate-200">
                    <td className="px-4 py-2">{m.name}</td>
                    <td className="px-4 py-2 text-right">{Number(m.current_stock)} {m.base_unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
