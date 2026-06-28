'use client';

import { useMemo, useState } from 'react';
import { usePackingRuns, useIntermediates, PackingRun } from '@/hooks/useProduction';
import { useRawMaterials } from '@/hooks/useInventory';
import { useProducts } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { Plus, Trash2, PackageCheck } from 'lucide-react';
import { POST, DELETE } from '@/lib/api';
import { toast } from 'sonner';
import { formatApiDate } from '@/lib/dateUtils';

const inputCls =
  'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const SOURCE_TYPES = [
  { value: 'intermediate', label: 'Intermediate (made in-house)' },
  { value: 'raw_material', label: 'Raw material (bought & repacked)' },
];
const today = () => new Date().toISOString().slice(0, 10);
const blankForm = {
  product_id: '', source_type: 'intermediate', source_id: '',
  packed_qty: '', pack_volume_used: '', source_consumed: '', wastage_qty: '', packing_date: today(), notes: '',
};

const n = (v: number | string | null | undefined) => Number(v ?? 0);

export default function PackingRunsPage() {
  const { data: runs = [], isLoading, refetch } = usePackingRuns();
  const { data: products = [] } = useProducts();
  const { data: intermediates = [] } = useIntermediates();
  const { data: rawMaterials = [] } = useRawMaterials();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openAdd = () => { setForm(blankForm); setIsModalOpen(true); };

  // When the operator picks a product, pre-fill pack_volume from the product's
  // pack_volume (the source-units-per-pack) so consumed bulk derives correctly.
  const onProduct = (productId: string) => {
    const p = products.find((x) => String(x.id) === productId);
    setForm((f) => ({
      ...f,
      product_id: productId,
      pack_volume_used: f.pack_volume_used || (p?.pack_volume != null ? String(p.pack_volume) : ''),
      source_type: p?.source_intermediate_id != null ? 'intermediate' : f.source_type,
      source_id: p?.source_intermediate_id != null ? String(p.source_intermediate_id) : f.source_id,
    }));
  };

  const sourceOptions = () =>
    form.source_type === 'intermediate'
      ? intermediates.map((i) => ({ id: i.id, label: `${i.name} (${i.base_unit})` }))
      : rawMaterials.map((r) => ({ id: r.id, label: `${r.name} (${r.unit})` }));

  const summary = useMemo(() => ({
    runs: runs.length,
    packed: runs.reduce((s, r) => s + n(r.packed_qty), 0),
    consumed: runs.reduce((s, r) => s + n(r.source_consumed), 0),
    wastage: runs.reduce((s, r) => s + n(r.wastage_qty), 0),
  }), [runs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.product_id || !form.source_id || !form.packed_qty) {
      toast.error('Product, source and packed quantity are required');
      return;
    }
    setIsSubmitting(true);
    try {
      await POST('/production/packing-runs', {
        product_id: Number(form.product_id),
        source_type: form.source_type,
        source_id: Number(form.source_id),
        packed_qty: parseFloat(form.packed_qty),
        pack_volume_used: form.pack_volume_used === '' ? null : parseFloat(form.pack_volume_used),
        source_consumed: form.source_consumed === '' ? null : parseFloat(form.source_consumed),
        wastage_qty: form.wastage_qty === '' ? 0 : parseFloat(form.wastage_qty),
        packing_date: form.packing_date,
        notes: form.notes || null,
      });
      toast.success('Packing run recorded');
      setIsModalOpen(false);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this packing run?')) return;
    try {
      await DELETE(`/production/packing-runs/${id}`);
      toast.success('Packing run deleted');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const columns: Column<PackingRun>[] = [
    { key: 'packing_date', header: 'Date', width: '120px', render: (r) => formatApiDate(r.packing_date, 'dd-MM-yyyy') },
    { key: 'product_title', header: 'Product', render: (r) => r.product_title || `#${r.product_id}` },
    {
      key: 'source_name', header: 'Packed from', render: (r) => (
        <span>
          {r.source_name || `#${r.source_id}`}
          <span className="text-xs text-slate-500"> · {r.source_type === 'raw_material' ? 'raw material' : 'intermediate'}</span>
        </span>
      ),
    },
    { key: 'packed_qty', header: 'Packed', width: '90px', render: (r) => <span className="text-emerald-400">{n(r.packed_qty)}</span> },
    {
      key: 'source_consumed', header: 'Bulk used', width: '110px',
      render: (r) => r.source_consumed != null
        ? <span>{n(r.source_consumed)}{r.source_unit ? ` ${r.source_unit}` : ''}</span>
        : <span className="text-slate-600">—</span>,
    },
    { key: 'wastage_qty', header: 'Wastage', width: '90px', render: (r) => n(r.wastage_qty) ? <span className="text-amber-400">{n(r.wastage_qty)}</span> : '—' },
    {
      key: 'actions', header: '', width: '60px', sortable: false,
      render: (r) => (
        <button onClick={() => remove(r.id)} className="p-2 hover:bg-slate-800/50 rounded-lg">
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Packing Runs</h1>
          <p className="text-slate-400">
            Log packets sealed from bulk (made or bought-and-repacked). A reconciliation record — it does not change sellable stock.
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
          <Plus className="w-5 h-5" /> Record packing
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Runs</p><p className="text-2xl font-bold text-white">{summary.runs}</p></div>
        <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Packets packed</p><p className="text-2xl font-bold text-emerald-400">{summary.packed}</p></div>
        <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Bulk used</p><p className="text-2xl font-bold text-white">{summary.consumed}</p></div>
        <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Wastage</p><p className="text-2xl font-bold text-amber-400">{summary.wastage}</p></div>
      </div>

      <DataTable data={runs} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search packing runs..." emptyMessage="No packing runs yet" />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record packing run" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Packed product (SKU) *</label>
            <select value={form.product_id} required onChange={(e) => onProduct(e.target.value)} className={inputCls}>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Packed from *</label>
              <select value={form.source_type}
                onChange={(e) => setForm({ ...form, source_type: e.target.value, source_id: '' })} className={inputCls}>
                {SOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Source *</label>
              <select value={form.source_id} required
                onChange={(e) => setForm({ ...form, source_id: e.target.value })} className={inputCls}>
                <option value="">Select source</option>
                {sourceOptions().map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Packets packed *</label>
              <input type="number" step="0.001" min="0" value={form.packed_qty} required
                onChange={(e) => setForm({ ...form, packed_qty: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Date *</label>
              <input type="date" value={form.packing_date} required
                onChange={(e) => setForm({ ...form, packing_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Source units / pack</label>
              <input type="number" step="0.0001" min="0" value={form.pack_volume_used} placeholder="e.g. 0.5"
                onChange={(e) => setForm({ ...form, pack_volume_used: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Bulk used (optional)</label>
              <input type="number" step="0.001" min="0" value={form.source_consumed} placeholder="auto from packs × volume"
                onChange={(e) => setForm({ ...form, source_consumed: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Wastage</label>
              <input type="number" step="0.001" min="0" value={form.wastage_qty}
                onChange={(e) => setForm({ ...form, wastage_qty: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Notes</label>
            <textarea value={form.notes} rows={2}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <PackageCheck className="w-3.5 h-3.5" /> Recording does not deduct stock — finished availability stays derived from bulk.
          </p>
          <div className="flex gap-3 pt-2 justify-end">
            <button type="button" onClick={() => setIsModalOpen(false)}
              className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
              {isSubmitting ? 'Saving...' : 'Record packing'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
