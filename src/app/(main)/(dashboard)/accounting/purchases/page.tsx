'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, PUT, POST } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { PodLink } from '@/components/PodImage';
import BulkPurchaseImportModal from '@/components/accounting/BulkPurchaseImportModal';
import { CheckCircle2, XCircle, Edit, Image as ImageIcon, Upload } from 'lucide-react';
import { toast } from 'sonner';

const inputCls =
  'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

interface PurchaseRow {
  id: number;
  purchase_date: string;
  invoice_no: string | null;
  qty: number | string;
  unit_price: number | string;
  total_amount: number | string;
  taxable_amount: number | string | null;
  cgst_amount: number | string | null;
  sgst_amount: number | string | null;
  igst_amount: number | string | null;
  gst_rate: number | string | null;
  hsn_code: string | null;
  supply_type: number | null;
  status: string;
  source: string;
  ocr_confidence: number | string | null;
  photos?: string[];
  vendor_name: string;
  raw_material_name: string;
  raw_material_unit: string;
}

interface QualityReading {
  id: number;
  value_numeric: number | string | null;
  value_text: string | null;
  source: string;
  param_name: string;
  param_unit: string | null;
  min_value?: number | string | null;
  max_value?: number | string | null;
}

type PurchaseDetail = PurchaseRow & { vendor_gstin?: string | null; quality_readings: QualityReading[]; notes?: string | null };

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'pending', label: 'To review' },
  { key: 'posted', label: 'Posted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const statusBadge = (s: string) => {
  switch (s) {
    case 'posted': return 'bg-green-500/20 text-green-400';
    case 'draft': return 'bg-amber-500/20 text-amber-400';
    case 'reviewed': return 'bg-blue-500/20 text-blue-400';
    case 'rejected': return 'bg-red-500/20 text-red-400';
    default: return 'bg-slate-700/50 text-slate-400';
  }
};

export default function AccountingPurchasesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pending');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({ qty: '', unit_price: '', gst_rate: '', supply_type: '1', hsn_code: '', invoice_no: '' });
  // Multi-select for bulk approval (only meaningful on the To-review tab).
  const [selected, setSelected] = useState<Set<number | string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  useEffect(() => { setSelected(new Set()); }, [tab]);

  // 'pending' tab maps to the API default (draft + reviewed) — no status param.
  const statusParam = tab === 'pending' ? undefined : { status: tab };
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['accounting', 'purchases', tab],
    queryFn: async () => (await GET<PurchaseRow[]>('/accounting/purchases', statusParam)).data || [],
  });

  const { data: detail } = useQuery({
    queryKey: ['accounting', 'purchase', selectedId],
    queryFn: async () => (await GET<PurchaseDetail>(`/accounting/purchases/${selectedId}`)).data,
    enabled: selectedId != null,
  });

  const openDetail = (row: PurchaseRow) => {
    setSelectedId(row.id);
    setForm({
      qty: String(row.qty ?? ''),
      unit_price: String(row.unit_price ?? ''),
      gst_rate: row.gst_rate != null ? String(row.gst_rate) : '',
      supply_type: String(row.supply_type ?? 1),
      hsn_code: row.hsn_code || '',
      invoice_no: row.invoice_no || '',
    });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['accounting', 'purchases'] });
    queryClient.invalidateQueries({ queryKey: ['accounting', 'purchase', selectedId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => PUT(`/accounting/purchases/${selectedId}`, {
      qty: Number(form.qty), unit_price: Number(form.unit_price),
      gst_rate: form.gst_rate === '' ? null : Number(form.gst_rate),
      supply_type: Number(form.supply_type), hsn_code: form.hsn_code || null,
      invoice_no: form.invoice_no || null,
    }),
    onSuccess: () => { toast.success('Saved'); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => POST(`/accounting/purchases/${id}/approve`, {}),
    onSuccess: () => { toast.success('Approved & posted to Tally queue'); setSelectedId(null); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => POST(`/accounting/purchases/${id}/reject`, {}),
    onSuccess: () => { toast.success('Rejected'); setSelectedId(null); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to reject'),
  });

  const bulkApprove = useMutation({
    mutationFn: async (ids: number[]) => POST('/accounting/purchases/bulk_approve', { ids }),
    onSuccess: (res) => {
      const d = ((res as { data?: { approved?: number; failed?: number } })?.data) ?? {};
      toast.success(`Approved ${d.approved ?? 0}${d.failed ? `, ${d.failed} failed` : ''}`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['accounting', 'purchases'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Bulk approve failed'),
  });

  // Export the currently filtered/sorted rows as a clean CSV that includes quantity.
  const exportPurchasesCsv = (filtered: PurchaseRow[]) => {
    const headers = ['Date', 'Vendor', 'Material', 'Qty', 'Unit', 'Unit price', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Status', 'Invoice no'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map((r) => [
      r.purchase_date, r.vendor_name, r.raw_material_name,
      Number(r.qty ?? 0), r.raw_material_unit, Number(r.unit_price ?? 0),
      Number(r.taxable_amount ?? 0), Number(r.cgst_amount ?? 0), Number(r.sgst_amount ?? 0),
      Number(r.igst_amount ?? 0), Number(r.total_amount ?? 0), r.status, r.invoice_no ?? '',
    ].map(esc).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchases-${tab}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<PurchaseRow>[] = [
    {
      key: 'edit', header: '', width: '50px', sortable: false,
      render: (r) => (
        <button onClick={() => openDetail(r)} className="p-2 hover:bg-slate-800/50 rounded-lg">
          <Edit className="w-4 h-4 text-purple-400" />
        </button>
      ),
    },
    { key: 'purchase_date', header: 'Date', width: '110px' },
    { key: 'vendor_name', header: 'Vendor' },
    {
      key: 'raw_material_name', header: 'Material',
      render: (r) => <span>{r.raw_material_name} <span className="text-slate-500">({Number(r.qty)} {r.raw_material_unit})</span></span>,
    },
    {
      key: 'total_amount', header: 'Total', width: '110px',
      render: (r) => <span className="text-cyan-400">₹{Number(r.total_amount ?? 0).toFixed(2)}</span>,
    },
    {
      key: 'source', header: 'Source', width: '110px',
      render: (r) => (
        <span className="text-xs text-slate-400">
          {r.source}{r.ocr_confidence != null ? ` · ${Math.round(Number(r.ocr_confidence) * 100)}%` : ''}
        </span>
      ),
    },
    {
      key: 'status', header: 'Status', width: '100px',
      render: (r) => <span className={`text-xs px-2 py-1 rounded-lg ${statusBadge(r.status)}`}>{r.status}</span>,
    },
  ];

  const canEdit = detail && detail.status !== 'posted' && detail.status !== 'rejected';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchases / Bills</h1>
          <p className="text-slate-400">Review raw-material purchases, then post them as Tally Purchase vouchers.</p>
        </div>
        <button onClick={() => setShowImport(true)}
          className="self-start flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600">
          <Upload className="w-5 h-5" /> Import bills
        </button>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === t.key ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-800/40 text-slate-400 border border-slate-700/50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pending' && selected.size > 0 && (
        <div className="flex items-center gap-3 glass rounded-xl px-4 py-2">
          <span className="text-sm text-slate-300">{selected.size} selected</span>
          <button onClick={() => bulkApprove.mutate([...selected].map(Number))} disabled={bulkApprove.isPending}
            className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Approve selected ({selected.size})
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-slate-400 hover:text-slate-200">Clear</button>
        </div>
      )}

      <DataTable data={rows} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search purchases..."
        getRowId={(r) => r.id} selectable={tab === 'pending'} selectedIds={selected} onSelectionChange={setSelected}
        exportable onExport={exportPurchasesCsv} />

      <Modal isOpen={selectedId != null} onClose={() => setSelectedId(null)} title={`Purchase #${selectedId ?? ''}`}>
        {!detail ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Vendor:</span> <span className="text-white">{detail.vendor_name}</span></div>
              <div><span className="text-slate-500">Material:</span> <span className="text-white">{detail.raw_material_name}</span></div>
              <div><span className="text-slate-500">GSTIN:</span> <span className="text-white">{detail.vendor_gstin || '—'}</span></div>
              <div><span className="text-slate-500">Status:</span> <span className={`text-xs px-2 py-0.5 rounded ${statusBadge(detail.status)}`}>{detail.status}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Qty ({detail.raw_material_unit})</label>
                <input type="number" step="any" value={form.qty} disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Unit price</label>
                <input type="number" step="any" value={form.unit_price} disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, unit_price: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">GST rate %</label>
                <input type="number" step="any" value={form.gst_rate} disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, gst_rate: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Supply</label>
                <select value={form.supply_type} disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, supply_type: e.target.value })} className={inputCls}>
                  <option value="1">Intra-state (CGST+SGST)</option>
                  <option value="2">Inter-state (IGST)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">HSN code</label>
                <input type="text" value={form.hsn_code} disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Invoice no.</label>
                <input type="text" value={form.invoice_no} disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} className={inputCls} />
              </div>
            </div>

            <div className="text-sm text-slate-300 bg-slate-800/40 rounded-lg px-3 py-2">
              Taxable ₹{Number(detail.taxable_amount ?? 0).toFixed(2)} · CGST ₹{Number(detail.cgst_amount ?? 0).toFixed(2)} ·
              SGST ₹{Number(detail.sgst_amount ?? 0).toFixed(2)} · IGST ₹{Number(detail.igst_amount ?? 0).toFixed(2)} ·
              <span className="text-cyan-400"> Total ₹{Number(detail.total_amount ?? 0).toFixed(2)}</span>
            </div>

            {detail.quality_readings?.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Quality readings</p>
                <div className="flex flex-wrap gap-2">
                  {detail.quality_readings.map((q) => (
                    <span key={q.id} className="text-xs bg-slate-800/40 rounded px-2 py-1 text-slate-300">
                      {q.param_name}: {q.value_numeric ?? q.value_text ?? '—'}{q.param_unit ? ` ${q.param_unit}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {detail.photos && detail.photos.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> Photos</p>
                <div className="flex flex-wrap gap-2">
                  {detail.photos.map((p, i) => (
                    <PodLink key={i} refValue={p}
                      className="text-xs text-blue-400 underline">Photo {i + 1}</PodLink>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              {canEdit && (
                <>
                  <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                    className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-200 rounded-xl text-sm disabled:opacity-50">
                    Save changes
                  </button>
                  <button onClick={() => rejectMutation.mutate(detail.id)} disabled={rejectMutation.isPending}
                    className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-50">
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <div className="flex-1" />
                  <button onClick={() => approveMutation.mutate(detail.id)} disabled={approveMutation.isPending}
                    className="px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                    <CheckCircle2 className="w-4 h-4" /> Approve &amp; Post
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <BulkPurchaseImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onDone={() => queryClient.invalidateQueries({ queryKey: ['accounting', 'purchases'] })}
      />
    </div>
  );
}
