'use client';

import { useState, useMemo } from 'react';
import {
  useStockLevels, useProductionHistory, useWastageReport, useYieldVariance,
} from '@/hooks/useProduction';
import DataTable, { Column } from '@/components/DataTable';
import { formatApiDate } from '@/lib/dateUtils';

const inputCls =
  'px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

type Tab = 'stock' | 'history' | 'wastage' | 'yield';
const TABS: { key: Tab; label: string }[] = [
  { key: 'stock', label: 'Stock Levels' },
  { key: 'history', label: 'Production History' },
  { key: 'wastage', label: 'Wastage' },
  { key: 'yield', label: 'Yield Variance' },
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function ProductionReportsPage() {
  const [tab, setTab] = useState<Tab>('stock');
  const [range, setRange] = useState({ from: '', to: '' });

  const activeRange = useMemo(() => {
    const f: Record<string, string> = {};
    if (range.from) f.from = range.from;
    if (range.to) f.to = range.to;
    return f;
  }, [range]);

  const stock = useStockLevels();
  const history = useProductionHistory(activeRange);
  const wastage = useWastageReport(activeRange);
  const yieldVar = useYieldVariance();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Production Reports</h1>
        <p className="text-slate-400">Stock levels, production history, wastage and yield variance</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === t.key
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
              : 'bg-slate-800/50 border border-slate-700/50 text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {(tab === 'history' || tab === 'wastage') && (
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">From</label>
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">To</label>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className={inputCls} />
          </div>
        </div>
      )}

      {tab === 'stock' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">Raw Materials</h2>
            <DataTable
              data={stock.data?.raw_materials ?? []} loading={stock.isLoading} pageSize={50} searchable={false}
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'unit', header: 'Unit', width: '110px' },
                { key: 'current_stock', header: 'Current Stock', width: '160px',
                  render: (r) => <span className="text-cyan-400">{Number(r.current_stock)}</span> },
              ] as Column<NonNullable<typeof stock.data>['raw_materials'][number]>[]}
              emptyMessage="No raw materials" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">Intermediates</h2>
            <DataTable
              data={stock.data?.intermediates ?? []} loading={stock.isLoading} pageSize={50} searchable={false}
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'base_unit', header: 'Unit', width: '110px' },
                { key: 'current_stock', header: 'Current Stock', width: '160px',
                  render: (r) => <span className="text-cyan-400">{Number(r.current_stock)}</span> },
              ] as Column<NonNullable<typeof stock.data>['intermediates'][number]>[]}
              emptyMessage="No intermediates" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">Finished (Manufactured) Products — derived stock</h2>
            <DataTable
              data={stock.data?.finished_manufactured ?? []} loading={stock.isLoading} pageSize={50} searchable={false}
              columns={[
                { key: 'title', header: 'Product' },
                { key: 'intermediate_name', header: 'Source Intermediate' },
                { key: 'pack_volume', header: 'Pack Volume', width: '130px', render: (r) => <span>{Number(r.pack_volume)}</span> },
                { key: 'intermediate_stock', header: 'Bulk Stock', width: '130px', render: (r) => <span>{Number(r.intermediate_stock)}</span> },
                { key: 'derived_stock', header: 'Derived Units', width: '140px',
                  render: (r) => <span className="text-cyan-400">{Number(r.derived_stock)}</span> },
              ] as Column<NonNullable<typeof stock.data>['finished_manufactured'][number]>[]}
              emptyMessage="No manufactured products" />
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="Production Runs" value={history.data?.summary?.run_count ?? 0} />
            <Stat label="Total Output" value={Number(history.data?.summary?.total_output ?? 0)} />
            <Stat label="Total Wastage" value={Number(history.data?.summary?.total_wastage ?? 0)} />
          </div>
          <DataTable
            data={history.data?.runs ?? []} loading={history.isLoading} pageSize={50} searchable={false}
            columns={[
              { key: 'production_date', header: 'Date', width: '120px',
                render: (r) => <span>{formatApiDate(r.production_date, 'dd-MM-yyyy')}</span> },
              { key: 'output_intermediate_name', header: 'Produced' },
              { key: 'recipe_name', header: 'Recipe' },
              { key: 'actual_output_qty', header: 'Output', width: '120px',
                render: (r) => <span className="text-cyan-400">{Number(r.actual_output_qty)} {r.output_base_unit}</span> },
              { key: 'wastage_qty', header: 'Wastage', width: '110px',
                render: (r) => <span className="text-amber-400">{Number(r.wastage_qty ?? 0)}</span> },
            ] as Column<NonNullable<typeof history.data>['runs'][number]>[]}
            emptyMessage="No production runs for this range" />
        </div>
      )}

      {tab === 'wastage' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="Production Wastage" value={Number(wastage.data?.summary?.production_wastage_total ?? 0)} />
            <Stat label="Write-offs" value={wastage.data?.summary?.writeoff_count ?? 0} />
            <Stat label="Write-off Qty" value={Number(wastage.data?.summary?.writeoff_qty_total ?? 0)} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">Production Process Loss</h2>
            <DataTable
              data={wastage.data?.production_wastage ?? []} loading={wastage.isLoading} pageSize={50} searchable={false}
              columns={[
                { key: 'production_date', header: 'Date', width: '120px',
                  render: (r) => <span>{formatApiDate(r.production_date, 'dd-MM-yyyy')}</span> },
                { key: 'output_intermediate_name', header: 'Intermediate' },
                { key: 'wastage_qty', header: 'Wastage', width: '140px',
                  render: (r) => <span className="text-amber-400">{Number(r.wastage_qty)} {r.base_unit}</span> },
              ] as Column<NonNullable<typeof wastage.data>['production_wastage'][number]>[]}
              emptyMessage="No production wastage for this range" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">Write-offs</h2>
            <DataTable
              data={wastage.data?.writeoffs ?? []} loading={wastage.isLoading} pageSize={50} searchable={false}
              columns={[
                { key: 'writeoff_date', header: 'Date', width: '120px',
                  render: (r) => <span>{formatApiDate(r.writeoff_date, 'dd-MM-yyyy')}</span> },
                { key: 'item_type', header: 'Type', width: '140px',
                  render: (r) => <span className="capitalize">{r.item_type.replace('_', ' ')}</span> },
                { key: 'qty', header: 'Qty', width: '110px', render: (r) => <span className="text-amber-400">{Number(r.qty)}</span> },
                { key: 'reason', header: 'Reason' },
              ] as Column<NonNullable<typeof wastage.data>['writeoffs'][number]>[]}
              emptyMessage="No write-offs for this range" />
          </div>
        </div>
      )}

      {tab === 'yield' && (
        <DataTable
          data={yieldVar.data ?? []} loading={yieldVar.isLoading} pageSize={50} searchable={false}
          columns={[
            { key: 'recipe_name', header: 'Recipe' },
            { key: 'output_intermediate_name', header: 'Produces' },
            { key: 'standard_output_qty', header: 'Standard', width: '120px', render: (r) => <span>{Number(r.standard_output_qty)}</span> },
            { key: 'avg_actual_output', header: 'Avg Actual', width: '120px', render: (r) => <span>{Number(r.avg_actual_output).toFixed(2)}</span> },
            { key: 'run_count', header: 'Runs', width: '90px' },
            { key: 'variance', header: 'Variance', width: '120px',
              render: (r) => <span className={r.variance < 0 ? 'text-red-400' : 'text-green-400'}>{r.variance > 0 ? '+' : ''}{r.variance}</span> },
            { key: 'variance_pct', header: 'Variance %', width: '120px',
              render: (r) => <span className={(r.variance_pct ?? 0) < 0 ? 'text-red-400' : 'text-green-400'}>
                {r.variance_pct == null ? '—' : `${r.variance_pct}%`}</span> },
          ] as Column<NonNullable<typeof yieldVar.data>[number]>[]}
          emptyMessage="No recipes" />
      )}
    </div>
  );
}
