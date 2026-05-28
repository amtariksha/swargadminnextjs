'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVendors, useVendorLedger } from '@/hooks/useInventory';
import DataTable, { Column } from '@/components/DataTable';
import type { LedgerEntry } from '@/hooks/useInventory';
import { formatApiDate } from '@/lib/dateUtils';

const inputCls =
  'w-full sm:w-72 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

function LedgerInner() {
  const searchParams = useSearchParams();
  const { data: vendors = [] } = useVendors();
  const [vendorId, setVendorId] = useState<number | null>(() => {
    const v = searchParams.get('vendor');
    return v ? Number(v) : null;
  });

  const { data: ledger, isLoading } = useVendorLedger(vendorId);

  const columns: Column<LedgerEntry>[] = [
    {
      key: 'entry_date', header: 'Date', width: '120px',
      render: (item) => <span>{formatApiDate(item.entry_date, 'dd-MM-yyyy')}</span>,
    },
    {
      key: 'entry_type', header: 'Type', width: '110px',
      render: (item) => (
        <span className={`text-xs px-2 py-1 rounded-lg ${item.entry_type === 'purchase' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}>
          {item.entry_type === 'purchase' ? 'Purchase' : 'Payment'}
        </span>
      ),
    },
    { key: 'detail', header: 'Detail' },
    { key: 'reference', header: 'Reference', width: '140px' },
    {
      key: 'amount', header: 'Amount', width: '130px',
      render: (item) => (
        <span className={item.entry_type === 'purchase' ? 'text-amber-400' : 'text-green-400'}>
          {item.entry_type === 'purchase' ? '+' : '−'}₹{Number(item.amount).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'balance', header: 'Balance', width: '130px',
      render: (item) => <span className="text-cyan-400">₹{Number(item.balance).toFixed(2)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Vendor Ledger</h1>
        <p className="text-slate-400">Purchases and payments with a running outstanding balance</p>
      </div>

      <select value={vendorId ?? ''} onChange={(e) => setVendorId(e.target.value ? Number(e.target.value) : null)}
        className={inputCls}>
        <option value="">Select a vendor</option>
        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>

      {ledger && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="glass rounded-2xl p-4">
            <p className="text-xs text-slate-400">Opening Balance</p>
            <p className="text-xl font-bold text-white">₹{Number(ledger.opening_balance).toFixed(2)}</p>
          </div>
          <div className="glass rounded-2xl p-4">
            <p className="text-xs text-slate-400">Entries</p>
            <p className="text-xl font-bold text-white">{ledger.entries.length}</p>
          </div>
          <div className="glass rounded-2xl p-4">
            <p className="text-xs text-slate-400">Closing Outstanding</p>
            <p className={`text-xl font-bold ${ledger.closing_balance > 0 ? 'text-amber-400' : 'text-green-400'}`}>
              ₹{Number(ledger.closing_balance).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {vendorId != null && (
        <DataTable data={ledger?.entries ?? []} columns={columns} loading={isLoading} pageSize={50}
          searchable={false} emptyMessage="No ledger entries for this vendor" />
      )}
    </div>
  );
}

export default function VendorLedgerPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
      <LedgerInner />
    </Suspense>
  );
}
