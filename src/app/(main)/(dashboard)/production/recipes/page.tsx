'use client';

import { useState } from 'react';
import { useRecipes, useIntermediates, fetchRecipe, Recipe } from '@/hooks/useProduction';
import { useRawMaterials } from '@/hooks/useInventory';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { POST, PUT, DELETE } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
  'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';
const smallCls =
  'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

type InputRow = { input_type: 'raw_material' | 'intermediate'; input_id: string; standard_qty: string };
const blankInput = (): InputRow => ({ input_type: 'raw_material', input_id: '', standard_qty: '' });
const blankForm = { output_intermediate_id: '', name: '', standard_output_qty: '', notes: '', is_active: 1 };

export default function RecipesPage() {
  const { data: recipes = [], isLoading, refetch } = useRecipes();
  const { data: intermediates = [] } = useIntermediates();
  const { data: rawMaterials = [] } = useRawMaterials();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Recipe | null>(null);
  const [deleteItem, setDeleteItem] = useState<Recipe | null>(null);
  const [form, setForm] = useState(blankForm);
  const [inputs, setInputs] = useState<InputRow[]>([blankInput()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openAdd = () => {
    setEditItem(null);
    setForm(blankForm);
    setInputs([blankInput()]);
    setIsModalOpen(true);
  };

  const openEdit = async (r: Recipe) => {
    try {
      const full = await fetchRecipe(r.id);
      setEditItem(full);
      setForm({
        output_intermediate_id: String(full.output_intermediate_id),
        name: full.name,
        standard_output_qty: String(full.standard_output_qty),
        notes: full.notes || '',
        is_active: full.is_active,
      });
      setInputs(
        (full.inputs ?? []).map((i) => ({
          input_type: i.input_type,
          input_id: String(i.input_id),
          standard_qty: String(i.standard_qty),
        })),
      );
      setIsModalOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load recipe');
    }
  };

  const updateInput = (idx: number, patch: Partial<InputRow>) => {
    setInputs(inputs.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.output_intermediate_id || !form.name.trim() || !form.standard_output_qty) return;
    const cleanInputs = inputs
      .filter((i) => i.input_id && i.standard_qty)
      .map((i) => ({ input_type: i.input_type, input_id: Number(i.input_id), standard_qty: parseFloat(i.standard_qty) }));
    if (cleanInputs.length === 0) {
      toast.error('Add at least one input');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        output_intermediate_id: Number(form.output_intermediate_id),
        name: form.name.trim(),
        standard_output_qty: parseFloat(form.standard_output_qty),
        notes: form.notes || null,
        inputs: cleanInputs,
      };
      if (editItem) {
        await PUT(`/production/recipes/${editItem.id}`, { ...payload, is_active: form.is_active });
        toast.success('Recipe updated');
      } else {
        await POST('/production/recipes', payload);
        toast.success('Recipe created');
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
      await DELETE(`/production/recipes/${deleteItem.id}`);
      toast.success('Recipe deleted');
      setDeleteItem(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const columns: Column<Recipe>[] = [
    {
      key: 'edit', header: 'Edit', width: '70px', sortable: false,
      render: (item) => (
        <button onClick={() => openEdit(item)} className="p-2 hover:bg-slate-800/50 rounded-lg">
          <Edit className="w-4 h-4 text-purple-400" />
        </button>
      ),
    },
    { key: 'name', header: 'Recipe' },
    { key: 'output_intermediate_name', header: 'Produces' },
    {
      key: 'standard_output_qty', header: 'Std Output', width: '130px',
      render: (item) => <span>{Number(item.standard_output_qty)} {item.output_base_unit}</span>,
    },
    { key: 'input_count', header: 'Inputs', width: '90px' },
    {
      key: 'is_active', header: 'Status', width: '90px',
      render: (item) => (
        <span className={`text-xs px-2 py-1 rounded-lg ${item.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-700/50 text-slate-400'}`}>
          {item.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
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
          <h1 className="text-2xl font-bold text-white">Recipes</h1>
          <p className="text-slate-400">Reusable bill-of-materials templates</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
          <Plus className="w-5 h-5" /> Add Recipe
        </button>
      </div>

      <DataTable data={recipes} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search recipes..." />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editItem ? 'Update Recipe' : 'Add Recipe'} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Recipe Name *</label>
            <input type="text" value={form.name} required autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Produces (Intermediate) *</label>
              <select value={form.output_intermediate_id} required
                onChange={(e) => setForm({ ...form, output_intermediate_id: e.target.value })} className={inputCls}>
                <option value="">Select intermediate</option>
                {intermediates.map((ip) => <option key={ip.id} value={ip.id}>{ip.name} ({ip.base_unit})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Standard Output Qty *</label>
              <input type="number" step="0.001" min="0" value={form.standard_output_qty} required
                onChange={(e) => setForm({ ...form, standard_output_qty: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">Inputs *</label>
              <button type="button" onClick={() => setInputs([...inputs, blankInput()])}
                className="text-xs px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded-lg text-purple-400">
                + Add Input
              </button>
            </div>
            <div className="space-y-2">
              {inputs.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select value={row.input_type} className={`col-span-3 ${smallCls}`}
                    onChange={(e) => updateInput(idx, { input_type: e.target.value as InputRow['input_type'], input_id: '' })}>
                    <option value="raw_material">Raw Material</option>
                    <option value="intermediate">Intermediate</option>
                  </select>
                  <select value={row.input_id} className={`col-span-5 ${smallCls}`}
                    onChange={(e) => updateInput(idx, { input_id: e.target.value })}>
                    <option value="">Select item</option>
                    {(row.input_type === 'raw_material' ? rawMaterials : intermediates).map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({row.input_type === 'raw_material' ? (it as { unit: string }).unit : (it as { base_unit: string }).base_unit})
                      </option>
                    ))}
                  </select>
                  <input type="number" step="0.001" min="0" placeholder="Qty" value={row.standard_qty}
                    className={`col-span-3 ${smallCls}`}
                    onChange={(e) => updateInput(idx, { standard_qty: e.target.value })} />
                  <button type="button" onClick={() => setInputs(inputs.filter((_, i) => i !== idx))}
                    className="col-span-1 flex justify-center text-red-400 hover:text-red-300"
                    disabled={inputs.length === 1}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
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
          <div className="flex gap-3 pt-4 justify-end">
            <button type="button" onClick={() => setIsModalOpen(false)}
              className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
              {isSubmitting ? 'Saving...' : editItem ? 'Update Recipe' : 'Add Recipe'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteItem}
        title="Delete Recipe"
        message={`Delete "${deleteItem?.name}"? Blocked if it has production runs.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
        variant="danger"
        confirmText="Delete"
      />
    </div>
  );
}
