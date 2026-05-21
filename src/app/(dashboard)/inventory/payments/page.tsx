'use client';

import { useState } from 'react';
import { useVendorPayments, useVendors, VendorPayment } from '@/hooks/useInventory';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Plus } from 'lucide-react';
import { POST, DELETE } from '@/lib/api';
import { toast } from 'sonner';
import { formatApiDate } from '@/lib/dateUtils';

const inputCls =
  'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const PAYMENT_MODES = ['cash', 'bank', 'upi', 'other'];
const today = () => new Date().toISOString().slice(0, 10);
const blankForm = { vendor_id: '', payment_date: today(), amount: '', payment_mode: 'cash', reference_no: '', notes: '' };

export default function VendorPaymentsPage() {
  const { data: payments = [], isLoading, refetch } = useVendorPayments();
  const { data: vendors = [] } = useVendors();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<VendorPayment | null>(null);
  const [form, setForm] = useState(blankForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openAdd = () => { setForm(blankForm); setIsModalOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendor_id || !form.amount) return;
    setIsSubmitting(true);
    try {
      await POST('/inventory/payments', {
        vendor_id: Number(form.vendor_id), payment_date: form.payment_date,
        amount: parseFloat(form.amount), payment_mode: form.payment_mode,
        reference_no: form.reference_no || null, notes: form.notes || null,
      });
      toast.success('Payment recorded');
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
      await DELETE(`/inventory/payments/${deleteItem.id}`);
      toast.success('Payment deleted');
      setDeleteItem(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const columns: Column<VendorPayment>[] = [
    {
      key: 'payment_date', header: 'Date', width: '120px',
      render: (item) => <span>{formatApiDate(item.payment_date, 'dd-MM-yyyy')}</span>,
    },
    { key: 'vendor_name', header: 'Vendor' },
    {
      key: 'amount', header: 'Amount', width: '130px',
      render: (item) => <span className="text-green-400">₹{Number(item.amount).toFixed(2)}</span>,
    },
    {
      key: 'payment_mode', header: 'Mode', width: '100px',
      render: (item) => <span className="capitalize">{item.payment_mode}</span>,
    },
    { key: 'reference_no', header: 'Reference', width: '140px' },
    {
      key: 'del', header: '', width: '70px', sortable: false,
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
          <h1 className="text-2xl font-bold text-white">Vendor Payments</h1>
          <p className="text-slate-400">Settlements against vendor outstanding</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
          <Plus className="w-5 h-5" /> Record Payment
        </button>
      </div>

      <DataTable data={payments} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search payments..." />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record Vendor Payment">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Vendor *</label>
            <select value={form.vendor_id} required
              onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} className={inputCls}>
              <option value="">Select vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Payment Date *</label>
              <input type="date" value={form.payment_date} required
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Amount *</label>
              <input type="number" step="0.01" min="0" value={form.amount} required
                onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Payment Mode</label>
              <select value={form.payment_mode}
                onChange={(e) => setForm({ ...form, payment_mode: e.target.value })} className={inputCls}>
                {PAYMENT_MODES.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Reference No</label>
              <input type="text" value={form.reference_no}
                onChange={(e) => setForm({ ...form, reference_no: e.target.value })} className={inputCls} />
            </div>
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
              {isSubmitting ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteItem}
        title="Delete Payment"
        message="Delete this payment? Vendor outstanding will go back up by this amount."
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
        variant="danger"
        confirmText="Delete"
      />
    </div>
  );
}
