'use client';

import { useState } from 'react';
import { usePurchaseEntries, useVendors, useRawMaterials, PurchaseEntry } from '@/hooks/useInventory';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import MonthRangePicker, { currentMonthRange } from '@/components/MonthRangePicker';
import { Plus, Edit } from 'lucide-react';
import { POST, PUT, DELETE } from '@/lib/api';
import { toast } from 'sonner';
import { formatApiDate } from '@/lib/dateUtils';

const inputCls =
  'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = {
  vendor_id: '', raw_material_id: '', purchase_date: today(),
  invoice_no: '', qty: '', unit_price: '', notes: '',
};

export default function PurchasesPage() {
  const [range, setRange] = useState(currentMonthRange);
  const { data: entries = [], isLoading, refetch } = usePurchaseEntries(range);
  const { data: vendors = [] } = useVendors();
  const { data: materials = [] } = useRawMaterials();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<PurchaseEntry | null>(null);
  const [deleteItem, setDeleteItem] = useState<PurchaseEntry | null>(null);
  const [form, setForm] = useState(blankForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = (parseFloat(form.qty) || 0) * (parseFloat(form.unit_price) || 0);

  const openAdd = () => { setEditItem(null); setForm(blankForm); setIsModalOpen(true); };
  const openEdit = (p: PurchaseEntry) => {
    setEditItem(p);
    setForm({
      vendor_id: String(p.vendor_id), raw_material_id: String(p.raw_material_id),
      purchase_date: (p.purchase_date || '').slice(0, 10), invoice_no: p.invoice_no || '',
      qty: String(p.qty), unit_price: String(p.unit_price), notes: p.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendor_id || !form.raw_material_id || !form.qty || !form.unit_price) return;
    setIsSubmitting(true);
    try {
      const payload = {
        vendor_id: Number(form.vendor_id), raw_material_id: Number(form.raw_material_id),
        purchase_date: form.purchase_date, invoice_no: form.invoice_no || null,
        qty: parseFloat(form.qty), unit_price: parseFloat(form.unit_price), notes: form.notes || null,
      };
      if (editItem) {
        await PUT(`/inventory/purchases/${editItem.id}`, payload);
        toast.success('Purchase entry updated');
      } else {
        await POST('/inventory/purchases', payload);
        toast.success('Purchase entry created');
      }
      setIsModalOpen(false);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await DELETE(`/inventory/purchases/${deleteItem.id}`);
      toast.success('Purchase entry deleted');
      setDeleteItem(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const columns: Column<PurchaseEntry>[] = [
    {
      key: 'edit', header: 'Edit', width: '70px', sortable: false,
      render: (item) => (
        <button onClick={() => openEdit(item)} className="p-2 hover:bg-slate-800/50 rounded-lg">
          <Edit className="w-4 h-4 text-purple-400" />
        </button>
      ),
    },
    {
      key: 'purchase_date', header: 'Date', width: '120px',
      render: (item) => <span>{formatApiDate(item.purchase_date, 'dd-MM-yyyy')}</span>,
    },
    { key: 'vendor_name', header: 'Vendor' },
    { key: 'raw_material_name', header: 'Raw Material' },
    {
      key: 'qty', header: 'Qty', width: '110px',
      render: (item) => <span>{Number(item.qty)} {item.raw_material_unit}</span>,
    },
    {
      key: 'unit_price', header: 'Unit Price', width: '110px',
      render: (item) => <span>₹{Number(item.unit_price).toFixed(2)}</span>,
    },
    {
      key: 'total_amount', header: 'Total', width: '120px',
      render: (item) => <span className="text-cyan-400">₹{Number(item.total_amount).toFixed(2)}</span>,
    },
    { key: 'invoice_no', header: 'Invoice', width: '120px' },
    {
      key: 'del', header: '', width: '60px', sortable: false,
      render: (item) => (
        <button onClick={() => setDeleteItem(item)} className="p-2 hover:bg-slate-800/50 rounded-lg text-red-400 text-xs">
          Delete
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchase Entries</h1>
          <p className="text-slate-400">One entry per incoming delivery / invoice</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
          <Plus className="w-5 h-5" /> Add Purchase
        </button>
      </div>

      <MonthRangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />

      <DataTable data={entries} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search purchases..." />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editItem ? 'Update Purchase Entry' : 'Add Purchase Entry'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Vendor *</label>
            <select value={form.vendor_id} required
              onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} className={inputCls}>
              <option value="">Select vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Raw Material *</label>
            <select value={form.raw_material_id} required
              onChange={(e) => setForm({ ...form, raw_material_id: e.target.value })} className={inputCls}>
              <option value="">Select raw material</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Purchase Date *</label>
              <input type="date" value={form.purchase_date} required
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className={`${inputCls} sm:max-w-[13rem]`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Invoice No</label>
              <input type="text" value={form.invoice_no}
                onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Quantity *</label>
              <input type="number" step="0.001" min="0" value={form.qty} required
                onChange={(e) => setForm({ ...form, qty: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Unit Price *</label>
              <input type="number" step="0.01" min="0" value={form.unit_price} required
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="px-4 py-3 bg-slate-800/40 rounded-xl text-sm text-slate-300">
            Total Amount: <span className="text-cyan-400 font-semibold">₹{total.toFixed(2)}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Notes</label>
            <textarea value={form.notes} rows={2}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </div>
          <div className="flex gap-3 pt-4 justify-end">
            <button type="button" onClick={() => setIsModalOpen(false)}
              className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
              {isSubmitting ? 'Saving...' : editItem ? 'Update' : 'Add Purchase'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteItem}
        title="Delete Purchase Entry"
        message="Delete this purchase entry? Stock and vendor outstanding will be reversed."
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
        variant="danger"
        confirmText="Delete"
      />
    </div>
  );
}
