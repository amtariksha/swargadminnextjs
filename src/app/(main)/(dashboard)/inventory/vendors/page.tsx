'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useVendors, Vendor } from '@/hooks/useInventory';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import VendorMaterialsEditor from '@/components/inventory/VendorMaterialsEditor';
import { Plus, Edit, BookText } from 'lucide-react';
import { POST, PUT, DELETE } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
  'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const blankForm = {
  name: '', phone: '', email: '', address: '', gst_number: '',
  opening_balance: '0', notes: '', is_active: 1,
};

export default function VendorsPage() {
  const { data: vendors = [], isLoading, refetch } = useVendors();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Vendor | null>(null);
  const [deleteItem, setDeleteItem] = useState<Vendor | null>(null);
  const [form, setForm] = useState(blankForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openAdd = () => { setEditItem(null); setForm(blankForm); setIsModalOpen(true); };
  const openEdit = (v: Vendor) => {
    setEditItem(v);
    setForm({
      name: v.name, phone: v.phone || '', email: v.email || '', address: v.address || '',
      gst_number: v.gst_number || '', opening_balance: String(v.opening_balance ?? 0),
      notes: v.notes || '', is_active: v.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setIsSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(), phone: form.phone || null, email: form.email || null,
        address: form.address || null, gst_number: form.gst_number || null,
        opening_balance: parseFloat(form.opening_balance) || 0, notes: form.notes || null,
      };
      if (editItem) {
        await PUT(`/inventory/vendors/${editItem.id}`, { ...payload, is_active: form.is_active });
        toast.success('Vendor updated');
      } else {
        await POST('/inventory/vendors', payload);
        toast.success('Vendor created');
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
      await DELETE(`/inventory/vendors/${deleteItem.id}`);
      toast.success('Vendor deleted');
      setDeleteItem(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const columns: Column<Vendor>[] = [
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
    { key: 'phone', header: 'Phone', width: '130px' },
    {
      key: 'outstanding', header: 'Outstanding', width: '130px',
      render: (item) => (
        <span className={Number(item.outstanding) > 0 ? 'text-amber-400' : 'text-slate-300'}>
          ₹{Number(item.outstanding ?? 0).toFixed(2)}
        </span>
      ),
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
      key: 'ledger', header: 'Ledger', width: '90px', sortable: false,
      render: (item) => (
        <Link href={`/inventory/ledger?vendor=${item.id}`} className="p-2 inline-flex hover:bg-slate-800/50 rounded-lg">
          <BookText className="w-4 h-4 text-cyan-400" />
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Vendors</h1>
          <p className="text-slate-400">Farmers &amp; raw-material suppliers</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
          <Plus className="w-5 h-5" /> Add Vendor
        </button>
      </div>

      <DataTable data={vendors} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search vendors..." />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editItem ? 'Update Vendor' : 'Add Vendor'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Name *</label>
            <input type="text" value={form.name} required autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Phone</label>
              <input type="text" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">GST Number</label>
              <input type="text" value={form.gst_number}
                onChange={(e) => setForm({ ...form, gst_number: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
            <input type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Address</label>
            <textarea value={form.address} rows={2}
              onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Opening Balance (pre-existing payable)
            </label>
            <input type="number" step="0.01" value={form.opening_balance}
              onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Notes</label>
            <textarea value={form.notes} rows={2}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </div>
          {editItem && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
              Active
            </label>
          )}
          {editItem && <VendorMaterialsEditor vendorId={editItem.id} />}
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
              {isSubmitting ? 'Saving...' : editItem ? 'Update' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteItem}
        title="Delete Vendor"
        message={`Delete "${deleteItem?.name}"? This is blocked if the vendor has purchases or payments.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
        variant="danger"
        confirmText="Delete"
      />
    </div>
  );
}
