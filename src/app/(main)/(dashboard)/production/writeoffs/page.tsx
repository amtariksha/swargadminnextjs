'use client';

import { useState } from 'react';
import { useWriteoffs, useIntermediates, Writeoff } from '@/hooks/useProduction';
import { useRawMaterials } from '@/hooks/useInventory';
import { useProducts } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { Plus } from 'lucide-react';
import { POST } from '@/lib/api';
import { toast } from 'sonner';
import { formatApiDate } from '@/lib/dateUtils';

const inputCls =
  'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const ITEM_TYPES = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'product', label: 'Finished Product' },
];
const today = () => new Date().toISOString().slice(0, 10);
const blankForm = { item_type: 'raw_material', item_id: '', qty: '', reason: '', writeoff_date: today() };

export default function WriteoffsPage() {
  const { data: writeoffs = [], isLoading, refetch } = useWriteoffs();
  const { data: rawMaterials = [] } = useRawMaterials();
  const { data: intermediates = [] } = useIntermediates();
  const { data: products = [] } = useProducts();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openAdd = () => { setForm(blankForm); setIsModalOpen(true); };

  const itemOptions = () => {
    if (form.item_type === 'raw_material') return rawMaterials.map((r) => ({ id: r.id, label: `${r.name} (${r.unit})` }));
    if (form.item_type === 'intermediate') return intermediates.map((i) => ({ id: i.id, label: `${i.name} (${i.base_unit})` }));
    return products.map((p) => ({ id: p.id, label: p.title }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item_id || !form.qty) return;
    setIsSubmitting(true);
    try {
      await POST('/production/writeoffs', {
        item_type: form.item_type, item_id: Number(form.item_id),
        qty: parseFloat(form.qty), reason: form.reason || null, writeoff_date: form.writeoff_date,
      });
      toast.success('Write-off recorded');
      setIsModalOpen(false);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<Writeoff>[] = [
    {
      key: 'writeoff_date', header: 'Date', width: '120px',
      render: (item) => <span>{formatApiDate(item.writeoff_date, 'dd-MM-yyyy')}</span>,
    },
    {
      key: 'item_type', header: 'Type', width: '140px',
      render: (item) => <span className="capitalize">{item.item_type.replace('_', ' ')}</span>,
    },
    { key: 'item_name', header: 'Item' },
    {
      key: 'qty', header: 'Quantity', width: '120px',
      render: (item) => <span className="text-amber-400">{Number(item.qty)}</span>,
    },
    { key: 'reason', header: 'Reason' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock Write-offs</h1>
          <p className="text-slate-400">Record wastage across raw materials, intermediates and products</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
          <Plus className="w-5 h-5" /> Record Write-off
        </button>
      </div>

      <DataTable data={writeoffs} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search write-offs..." />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record Stock Write-off">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Stock Type *</label>
            <select value={form.item_type}
              onChange={(e) => setForm({ ...form, item_type: e.target.value, item_id: '' })} className={inputCls}>
              {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Item *</label>
            <select value={form.item_id} required
              onChange={(e) => setForm({ ...form, item_id: e.target.value })} className={inputCls}>
              <option value="">Select item</option>
              {itemOptions().map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Quantity *</label>
              <input type="number" step="0.001" min="0" value={form.qty} required
                onChange={(e) => setForm({ ...form, qty: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Date *</label>
              <input type="date" value={form.writeoff_date} required
                onChange={(e) => setForm({ ...form, writeoff_date: e.target.value })} className={`${inputCls} sm:max-w-[13rem]`} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Reason</label>
            <textarea value={form.reason} rows={2}
              onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} />
          </div>
          <div className="flex gap-3 pt-4 justify-end">
            <button type="button" onClick={() => setIsModalOpen(false)}
              className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
              {isSubmitting ? 'Saving...' : 'Record Write-off'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
