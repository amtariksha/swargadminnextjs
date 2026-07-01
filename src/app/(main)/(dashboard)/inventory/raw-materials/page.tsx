'use client';

import { useState } from 'react';
import { useRawMaterials, RawMaterial } from '@/hooks/useInventory';
import { useHsnCodes } from '@/hooks/useAccounting';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import QualityParamsEditor from '@/components/inventory/QualityParamsEditor';
import { Plus, Edit, SlidersHorizontal } from 'lucide-react';
import { POST, PUT, DELETE } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
  'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const blankForm = {
  name: '', unit: '', notes: '', is_active: 1, show_in_collection: 0,
  hsn_rate_id: '', hsn_code: '', gst_rate: '', default_unit_price: '',
};
const today = () => new Date().toISOString().slice(0, 10);

export default function RawMaterialsPage() {
  const { data: materials = [], isLoading, refetch } = useRawMaterials();
  const { data: hsnCodes = [] } = useHsnCodes();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<RawMaterial | null>(null);
  const [deleteItem, setDeleteItem] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState(blankForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [adjItem, setAdjItem] = useState<RawMaterial | null>(null);
  const [adjForm, setAdjForm] = useState({ qty: '', movement_date: today(), notes: '' });

  // Flatten HSN codes → rates into a single picker. Selecting a rate sets the
  // material's hsn_rate_id + hsn_code + gst_rate so Purchase vouchers carry GST.
  const hsnRateOptions = hsnCodes.flatMap((c) =>
    (c.rates || []).map((r) => ({ id: r.id, code: c.code, gst_rate: r.gst_rate })),
  );
  const onHsnRateChange = (rateId: string) => {
    const opt = hsnRateOptions.find((o) => String(o.id) === rateId);
    setForm((f) => ({
      ...f,
      hsn_rate_id: rateId,
      hsn_code: opt ? opt.code : f.hsn_code,
      gst_rate: opt ? String(opt.gst_rate) : f.gst_rate,
    }));
  };

  const openAdd = () => { setEditItem(null); setForm(blankForm); setIsModalOpen(true); };
  const openEdit = (m: RawMaterial) => {
    setEditItem(m);
    setForm({
      name: m.name, unit: m.unit, notes: m.notes || '', is_active: m.is_active,
      show_in_collection: m.show_in_collection ?? 0,
      hsn_rate_id: m.hsn_rate_id != null ? String(m.hsn_rate_id) : '',
      hsn_code: m.hsn_code || '',
      gst_rate: m.gst_rate != null ? String(m.gst_rate) : '',
      default_unit_price: m.default_unit_price != null ? String(m.default_unit_price) : '',
    });
    setIsModalOpen(true);
  };
  const openAdjust = (m: RawMaterial) => {
    setAdjItem(m);
    setAdjForm({ qty: '', movement_date: today(), notes: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) return;
    setIsSubmitting(true);
    const gstFields = {
      hsn_rate_id: form.hsn_rate_id === '' ? null : Number(form.hsn_rate_id),
      hsn_code: form.hsn_code || null,
      gst_rate: form.gst_rate === '' ? null : Number(form.gst_rate),
      default_unit_price: form.default_unit_price === '' ? null : Number(form.default_unit_price),
    };
    try {
      if (editItem) {
        await PUT(`/inventory/raw-materials/${editItem.id}`, {
          name: form.name.trim(), unit: form.unit.trim(), notes: form.notes || null, is_active: form.is_active,
          show_in_collection: form.show_in_collection ? 1 : 0,
          ...gstFields,
        });
        toast.success('Raw material updated');
      } else {
        await POST('/inventory/raw-materials', {
          name: form.name.trim(), unit: form.unit.trim(), notes: form.notes || null,
          show_in_collection: form.show_in_collection ? 1 : 0,
          ...gstFields,
        });
        toast.success('Raw material created');
      }
      setIsModalOpen(false);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjItem || !adjForm.qty) return;
    setIsSubmitting(true);
    try {
      await POST(`/inventory/raw-materials/${adjItem.id}/adjustment`, {
        qty: parseFloat(adjForm.qty), movement_date: adjForm.movement_date, notes: adjForm.notes || null,
      });
      toast.success('Stock adjusted');
      setAdjItem(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Adjustment failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await DELETE(`/inventory/raw-materials/${deleteItem.id}`);
      toast.success('Raw material deleted');
      setDeleteItem(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const columns: Column<RawMaterial>[] = [
    {
      key: 'edit', header: 'Edit', width: '70px', sortable: false,
      render: (item) => (
        <button onClick={() => openEdit(item)} className="p-2 hover:bg-slate-800/50 rounded-lg">
          <Edit className="w-4 h-4 text-purple-400" />
        </button>
      ),
    },
    { key: 'id', header: 'ID', width: '60px' },
    { key: 'name', header: 'Name' },
    { key: 'unit', header: 'Unit', width: '90px' },
    {
      key: 'current_stock', header: 'Current Stock', width: '140px',
      render: (item) => <span className="text-cyan-400">{Number(item.current_stock ?? 0)} {item.unit}</span>,
    },
    {
      key: 'is_active', header: 'Status', width: '90px',
      render: (item) => (
        <span className={`text-xs px-2 py-1 rounded-lg ${item.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-700/50 text-slate-400'}`}>
          {item.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'show_in_collection', header: 'Collection', width: '110px',
      render: (item) => item.show_in_collection
        ? <span className="text-xs px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-300">In pickup</span>
        : <span className="text-slate-600 text-xs">—</span>,
    },
    {
      key: 'adjust', header: 'Adjust', width: '90px', sortable: false,
      render: (item) => (
        <button onClick={() => openAdjust(item)} className="p-2 hover:bg-slate-800/50 rounded-lg" title="Adjust stock">
          <SlidersHorizontal className="w-4 h-4 text-amber-400" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Raw Materials</h1>
          <p className="text-slate-400">Milk &amp; every other purchased raw material</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
          <Plus className="w-5 h-5" /> Add Raw Material
        </button>
      </div>

      <DataTable data={materials} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search raw materials..." />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editItem ? 'Update Raw Material' : 'Add Raw Material'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Name *</label>
            <input type="text" value={form.name} required autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Unit * (e.g. litre, kg, unit)</label>
            <input type="text" value={form.unit} required
              onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputCls} />
          </div>
          {editItem && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Current Stock</label>
              <input type="text" value={`${Number(editItem.current_stock ?? 0)} ${editItem.unit}`} disabled
                className="w-full px-4 py-2.5 bg-slate-800/30 border border-slate-700/30 rounded-xl text-slate-500" />
              <p className="text-xs text-slate-500 mt-1">Changed only via purchases and stock adjustments.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">HSN / GST rate</label>
              <select value={form.hsn_rate_id} onChange={(e) => onHsnRateChange(e.target.value)} className={inputCls}>
                <option value="">— none —</option>
                {hsnRateOptions.map((o) => (
                  <option key={o.id} value={String(o.id)}>{o.code} @ {o.gst_rate}%</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">GST rate %</label>
              <input type="number" step="any" value={form.gst_rate}
                onChange={(e) => setForm({ ...form, gst_rate: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">HSN code</label>
              <input type="text" value={form.hsn_code}
                onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Default price / unit</label>
              <input type="number" step="any" value={form.default_unit_price}
                onChange={(e) => setForm({ ...form, default_unit_price: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Notes</label>
            <textarea value={form.notes} rows={2}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input type="checkbox" className="mt-1" checked={!!form.show_in_collection}
              onChange={(e) => setForm({ ...form, show_in_collection: e.target.checked ? 1 : 0 })} />
            <span>
              Show in delivery-app collection pickup
              <span className="block text-xs text-slate-500">
                Only flagged materials (e.g. Raw Milk) — and vendors linked to them — appear in the truck driver&apos;s pickup screen.
              </span>
            </span>
          </label>
          {editItem && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
              Active
            </label>
          )}
          {editItem && <QualityParamsEditor rawMaterialId={editItem.id} />}
          <div className="flex gap-3 pt-4">
            {editItem && (
              <button type="button" onClick={() => { setIsModalOpen(false); setDeleteItem(editItem); }}
                className="px-4 py-2.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm hover:bg-red-500/30">
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button type="button" onClick={() => setIsModalOpen(false)}
              className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
              {isSubmitting ? 'Saving...' : editItem ? 'Update' : 'Add Raw Material'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!adjItem} onClose={() => setAdjItem(null)} title={`Adjust Stock — ${adjItem?.name ?? ''}`}>
        <form onSubmit={handleAdjust} className="space-y-4">
          <p className="text-sm text-slate-400">
            Current stock: <span className="text-cyan-400">{Number(adjItem?.current_stock ?? 0)} {adjItem?.unit}</span>.
            Enter a signed quantity — positive adds, negative removes (spoilage / count fix).
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Adjustment Quantity *</label>
            <input type="number" step="0.001" value={adjForm.qty} required autoFocus
              onChange={(e) => setAdjForm({ ...adjForm, qty: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Date *</label>
            <input type="date" value={adjForm.movement_date} required
              onChange={(e) => setAdjForm({ ...adjForm, movement_date: e.target.value })} className={`${inputCls} sm:max-w-[13rem]`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Reason / Notes</label>
            <textarea value={adjForm.notes} rows={2}
              onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })} className={inputCls} />
          </div>
          <div className="flex gap-3 pt-4 justify-end">
            <button type="button" onClick={() => setAdjItem(null)}
              className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
              {isSubmitting ? 'Saving...' : 'Apply Adjustment'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteItem}
        title="Delete Raw Material"
        message={`Delete "${deleteItem?.name}"? This is blocked if it has purchase entries.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
        variant="danger"
        confirmText="Delete"
      />
    </div>
  );
}
