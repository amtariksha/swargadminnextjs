'use client';

import { useState, useMemo } from 'react';
import { usePurchaseReport, useVendors, useRawMaterials } from '@/hooks/useInventory';
import DataTable, { Column } from '@/components/DataTable';

const inputCls =
  'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

type VendorRow = { vendor_id: number; vendor_name: string; entry_count: number; total_amount: number | string };
type MaterialRow = {
  raw_material_id: number; raw_material_name: string; raw_material_unit: string;
  entry_count: number; total_qty: number | string; total_amount: number | string;
};

export default function PurchaseReportPage() {
  const { data: vendors = [] } = useVendors();
  const { data: materials = [] } = useRawMaterials();
  const [filters, setFilters] = useState({ vendor_id: '', raw_material_id: '', from: '', to: '' });

  const activeFilters = useMemo(() => {
    const f: Record<string, string> = {};
    if (filters.vendor_id) f.vendor_id = filters.vendor_id;
    if (filters.raw_material_id) f.raw_material_id = filters.raw_material_id;
    if (filters.from) f.from = filters.from;
    if (filters.to) f.to = filters.to;
    return f;
  }, [filters]);

  const { data: report, isLoading } = usePurchaseReport(activeFilters);

  const vendorCols: Column<VendorRow>[] = [
    { key: 'vendor_name', header: 'Vendor' },
    { key: 'entry_count', header: 'Entries', width: '110px' },
    {
      key: 'total_amount', header: 'Total Amount', width: '160px',
      render: (item) => <span className="text-cyan-400">₹{Number(item.total_amount).toFixed(2)}</span>,
    },
  ];

  const materialCols: Column<MaterialRow>[] = [
    { key: 'raw_material_name', header: 'Raw Material' },
    {
      key: 'total_qty', header: 'Total Qty', width: '140px',
      render: (item) => <span>{Number(item.total_qty)} {item.raw_material_unit}</span>,
    },
    { key: 'entry_count', header: 'Entries', width: '110px' },
    {
      key: 'total_amount', header: 'Total Amount', width: '160px',
      render: (item) => <span className="text-cyan-400">₹{Number(item.total_amount).toFixed(2)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Purchase Report</h1>
        <p className="text-slate-400">Purchase totals by vendor, raw material and date range</p>
      </div>

      <div className="glass rounded-2xl p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Vendor</label>
          <select value={filters.vendor_id} onChange={(e) => setFilters({ ...filters, vendor_id: e.target.value })} className={inputCls}>
            <option value="">All vendors</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Raw Material</label>
          <select value={filters.raw_material_id} onChange={(e) => setFilters({ ...filters, raw_material_id: e.target.value })} className={inputCls}>
            <option value="">All materials</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">From</label>
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={`${inputCls} sm:max-w-[13rem]`} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">To</label>
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={`${inputCls} sm:max-w-[13rem]`} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-slate-400">Total Entries</p>
          <p className="text-xl font-bold text-white">{report?.summary?.entry_count ?? 0}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-slate-400">Total Quantity</p>
          <p className="text-xl font-bold text-white">{Number(report?.summary?.total_qty ?? 0)}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-slate-400">Total Amount</p>
          <p className="text-xl font-bold text-cyan-400">₹{Number(report?.summary?.total_amount ?? 0).toFixed(2)}</p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white mb-2">By Vendor</h2>
        <DataTable data={(report?.by_vendor ?? []) as VendorRow[]} columns={vendorCols} loading={isLoading}
          pageSize={50} searchable={false} emptyMessage="No purchases for these filters" />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white mb-2">By Raw Material</h2>
        <DataTable data={(report?.by_raw_material ?? []) as MaterialRow[]} columns={materialCols} loading={isLoading}
          pageSize={50} searchable={false} emptyMessage="No purchases for these filters" />
      </div>
    </div>
  );
}
