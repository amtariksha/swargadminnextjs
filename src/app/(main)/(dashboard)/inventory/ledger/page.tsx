'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVendors, useVendorLedger } from '@/hooks/useInventory';
import DataTable, { Column } from '@/components/DataTable';
import ConfirmDialog from '@/components/ConfirmDialog';
import MonthRangePicker, { currentMonthRange } from '@/components/MonthRangePicker';
import type { LedgerEntry } from '@/hooks/useInventory';
import { formatApiDate } from '@/lib/dateUtils';
import { DELETE } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
  'w-full sm:w-72 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

function LedgerInner() {
  const searchParams = useSearchParams();
  const { data: vendors = [] } = useVendors();
  const [vendorId, setVendorId] = useState<number | null>(() => {
    const v = searchParams.get('vendor');
    return v ? Number(v) : null;
  });
  const [range, setRange] = useState(currentMonthRange);
  const [deleteItem, setDeleteItem] = useState<LedgerEntry | null>(null);

  const { data: ledger, isLoading, refetch } = useVendorLedger(vendorId, range);

  const handleDelete = async () => {
    if (!deleteItem) return;
    const path = deleteItem.entry_type === 'purchase'
      ? `/inventory/purchases/${deleteItem.ref_id}`
      : `/inventory/payments/${deleteItem.ref_id}`;
    try {
      await DELETE(path);
      toast.success(deleteItem.entry_type === 'purchase' ? 'Invoice deleted' : 'Payment deleted');
      setDeleteItem(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

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
    {
      key: 'invoice_no', header: 'Invoice No', width: '130px',
      render: (item) => item.invoice_no
        ? <span className="text-slate-200">{item.invoice_no}</span>
        : <span className="text-slate-600">—</span>,
    },
    {
      key: 'qty', header: 'Qty', width: '90px',
      render: (item) => item.qty != null
        ? <span className="text-slate-200">{Number(item.qty)}</span>
        : <span className="text-slate-600">—</span>,
    },
    {
      key: 'rate', header: 'Rate', width: '110px',
      render: (item) => item.rate != null
        ? <span className="text-slate-200">₹{Number(item.rate).toFixed(2)}</span>
        : <span className="text-slate-600">—</span>,
    },
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
    {
      key: 'del', header: '', width: '70px', sortable: false,
      render: (item) => (
        <button onClick={() => setDeleteItem(item)}
          className="p-2 hover:bg-slate-800/50 rounded-lg text-red-400 text-xs" title="Delete">
          Delete
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Vendor Ledger</h1>
        <p className="text-slate-400">Purchases and payments with a running outstanding balance</p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <select value={vendorId ?? ''} onChange={(e) => setVendorId(e.target.value ? Number(e.target.value) : null)}
          className={inputCls}>
          <option value="">Select a vendor</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <MonthRangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
      </div>

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
          searchable={false} emptyMessage="No ledger entries for this vendor in this period" />
      )}

      <ConfirmDialog
        isOpen={!!deleteItem}
        title={deleteItem?.entry_type === 'purchase' ? 'Delete Invoice' : 'Delete Payment'}
        message={
          deleteItem?.entry_type === 'purchase'
            ? `Delete purchase invoice ${deleteItem?.invoice_no ? `"${deleteItem.invoice_no}"` : `#${deleteItem?.ref_id}`}? Stock and vendor outstanding will be reversed.`
            : `Delete this payment (₹${Number(deleteItem?.amount ?? 0).toFixed(2)})? The vendor outstanding will be restored.`
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
        variant="danger"
        confirmText="Delete"
      />
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
