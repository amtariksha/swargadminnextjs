'use client';

import { useState } from 'react';
import { useIntermediates, IntermediateProduct } from '@/hooks/useProduction';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Plus, Edit } from 'lucide-react';
import { POST, PUT, DELETE } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
  'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const BASE_UNITS = ['ml', 'l', 'g', 'kg'];
const blankForm = { name: '', base_unit: 'ml', notes: '', is_active: 1 };

export default function IntermediatesPage() {
  const { data: items = [], isLoading, refetch } = useIntermediates();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<IntermediateProduct | null>(null);
  const [deleteItem, setDeleteItem] = useState<IntermediateProduct | null>(null);
  const [form, setForm] = useState(blankForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openAdd = () => { setEditItem(null); setForm(blankForm); setIsModalOpen(true); };
  const openEdit = (it: IntermediateProduct) => {
    setEditItem(it);
    setForm({ name: it.name, base_unit: it.base_unit, notes: it.notes || '', is_active: it.is_active });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setIsSubmitting(true);
    try {
      if (editItem) {
        await PUT(`/production/intermediates/${editItem.id}`, {
          name: form.name.trim(), base_unit: form.base_unit, notes: form.notes || null, is_active: form.is_active,
        });
        toast.success('Intermediate updated');
      } else {
        await POST('/production/intermediates', {
          name: form.name.trim(), base_unit: form.base_unit, notes: form.notes || null,
        });
        toast.success('Intermediate created');
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
      await DELETE(`/production/intermediates/${deleteItem.id}`);
      toast.success('Intermediate deleted');
      setDeleteItem(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const columns: Column<IntermediateProduct>[] = [
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
    { key: 'base_unit', header: 'Base Unit', width: '110px' },
    {
      key: 'current_stock', header: 'Current Stock', width: '150px',
      render: (item) => <span className="text-cyan-400">{Number(item.current_stock ?? 0)} {item.base_unit}</span>,
    },
    {
      key: 'is_active', header: 'Status', width: '90px',
      render: (item) => (
        <span className={`text-xs px-2 py-1 rounded-lg ${item.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-700/50 text-slate-400'}`}>
          {item.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Intermediate Products</h1>
          <p className="text-slate-400">Work-in-progress items (White Base, Bulk Gelato)</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
          <Plus className="w-5 h-5" /> Add Intermediate
        </button>
      </div>

      <DataTable data={items} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search intermediates..." />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editItem ? 'Update Intermediate' : 'Add Intermediate'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Name *</label>
            <input type="text" value={form.name} required autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Base Unit *</label>
            <select value={form.base_unit}
              onChange={(e) => setForm({ ...form, base_unit: e.target.value })} className={inputCls}>
              {BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {editItem && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Current Stock</label>
              <input type="text" value={`${Number(editItem.current_stock ?? 0)} ${editItem.base_unit}`} disabled
                className="w-full px-4 py-2.5 bg-slate-800/30 border border-slate-700/30 rounded-xl text-slate-500" />
              <p className="text-xs text-slate-500 mt-1">Changed only via production runs, sales and write-offs.</p>
            </div>
          )}
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
              {isSubmitting ? 'Saving...' : editItem ? 'Update' : 'Add Intermediate'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteItem}
        title="Delete Intermediate"
        message={`Delete "${deleteItem?.name}"? Blocked if used by recipes, production runs or products.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
        variant="danger"
        confirmText="Delete"
      />
    </div>
  );
}
