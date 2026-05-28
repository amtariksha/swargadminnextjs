'use client';

import { useState } from 'react';
import {
  useProductionRuns, useRecipes, useIntermediates,
  fetchRecipe, fetchProductionRun, ProductionRun,
} from '@/hooks/useProduction';
import { useRawMaterials } from '@/hooks/useInventory';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { POST, PUT, DELETE } from '@/lib/api';
import { toast } from 'sonner';
import { formatApiDate } from '@/lib/dateUtils';

const inputCls =
  'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';
const smallCls =
  'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

type InputRow = { input_type: 'raw_material' | 'intermediate'; input_id: string; qty_consumed: string };
const blankInput = (): InputRow => ({ input_type: 'raw_material', input_id: '', qty_consumed: '' });
const today = () => new Date().toISOString().slice(0, 10);
const blankForm = {
  recipe_id: '', output_intermediate_id: '', production_date: today(),
  actual_output_qty: '', wastage_qty: '0', notes: '',
};

export default function ProductionRunsPage() {
  const { data: runs = [], isLoading, refetch } = useProductionRuns();
  const { data: recipes = [] } = useRecipes();
  const { data: intermediates = [] } = useIntermediates();
  const { data: rawMaterials = [] } = useRawMaterials();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<ProductionRun | null>(null);
  const [deleteItem, setDeleteItem] = useState<ProductionRun | null>(null);
  const [form, setForm] = useState(blankForm);
  const [inputs, setInputs] = useState<InputRow[]>([blankInput()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openAdd = () => {
    setEditItem(null);
    setForm(blankForm);
    setInputs([blankInput()]);
    setIsModalOpen(true);
  };

  const openEdit = async (r: ProductionRun) => {
    try {
      const full = await fetchProductionRun(r.id);
      setEditItem(full);
      setForm({
        recipe_id: full.recipe_id ? String(full.recipe_id) : '',
        output_intermediate_id: String(full.output_intermediate_id),
        production_date: (full.production_date || '').slice(0, 10),
        actual_output_qty: String(full.actual_output_qty),
        wastage_qty: String(full.wastage_qty ?? 0),
        notes: full.notes || '',
      });
      setInputs(
        (full.inputs ?? []).map((i) => ({
          input_type: i.input_type,
          input_id: String(i.input_id),
          qty_consumed: String(i.qty_consumed),
        })),
      );
      setIsModalOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load production run');
    }
  };

  // Picking a recipe pre-fills the output, standard output qty and inputs.
  const onRecipeChange = async (recipeId: string) => {
    setForm((f) => ({ ...f, recipe_id: recipeId }));
    if (!recipeId) return;
    try {
      const recipe = await fetchRecipe(Number(recipeId));
      setForm((f) => ({
        ...f,
        recipe_id: recipeId,
        output_intermediate_id: String(recipe.output_intermediate_id),
        actual_output_qty: String(recipe.standard_output_qty),
      }));
      setInputs(
        (recipe.inputs ?? []).map((i) => ({
          input_type: i.input_type,
          input_id: String(i.input_id),
          qty_consumed: String(i.standard_qty),
        })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load recipe');
    }
  };

  const updateInput = (idx: number, patch: Partial<InputRow>) => {
    setInputs(inputs.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.output_intermediate_id || !form.production_date || !form.actual_output_qty) return;
    const cleanInputs = inputs
      .filter((i) => i.input_id && i.qty_consumed)
      .map((i) => ({ input_type: i.input_type, input_id: Number(i.input_id), qty_consumed: parseFloat(i.qty_consumed) }));
    if (cleanInputs.length === 0) {
      toast.error('Add at least one input');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        recipe_id: form.recipe_id ? Number(form.recipe_id) : null,
        output_intermediate_id: Number(form.output_intermediate_id),
        production_date: form.production_date,
        actual_output_qty: parseFloat(form.actual_output_qty),
        wastage_qty: form.wastage_qty ? parseFloat(form.wastage_qty) : 0,
        notes: form.notes || null,
        inputs: cleanInputs,
      };
      if (editItem) {
        await PUT(`/production/runs/${editItem.id}`, payload);
        toast.success('Production run updated');
      } else {
        await POST('/production/runs', payload);
        toast.success('Production run recorded');
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
      await DELETE(`/production/runs/${deleteItem.id}`);
      toast.success('Production run deleted');
      setDeleteItem(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const columns: Column<ProductionRun>[] = [
    {
      key: 'edit', header: 'Edit', width: '70px', sortable: false,
      render: (item) => (
        <button onClick={() => openEdit(item)} className="p-2 hover:bg-slate-800/50 rounded-lg">
          <Edit className="w-4 h-4 text-purple-400" />
        </button>
      ),
    },
    {
      key: 'production_date', header: 'Date', width: '120px',
      render: (item) => <span>{formatApiDate(item.production_date, 'dd-MM-yyyy')}</span>,
    },
    { key: 'output_intermediate_name', header: 'Produced' },
    { key: 'recipe_name', header: 'Recipe' },
    {
      key: 'actual_output_qty', header: 'Output', width: '120px',
      render: (item) => <span className="text-cyan-400">{Number(item.actual_output_qty)} {item.output_base_unit}</span>,
    },
    {
      key: 'wastage_qty', header: 'Wastage', width: '110px',
      render: (item) => <span className="text-amber-400">{Number(item.wastage_qty ?? 0)} {item.output_base_unit}</span>,
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
          <h1 className="text-2xl font-bold text-white">Production Records</h1>
          <p className="text-slate-400">Batches that consume inputs and yield an intermediate</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
          <Plus className="w-5 h-5" /> New Production Run
        </button>
      </div>

      <DataTable data={runs} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search production runs..." />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editItem ? 'Update Production Run' : 'New Production Run'} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Recipe (optional — pre-fills inputs)</label>
            <select value={form.recipe_id} onChange={(e) => onRecipeChange(e.target.value)} className={inputCls}>
              <option value="">Ad-hoc run (no recipe)</option>
              {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
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
              <label className="block text-sm font-medium text-slate-300 mb-2">Production Date *</label>
              <input type="date" value={form.production_date} required
                onChange={(e) => setForm({ ...form, production_date: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Actual Output Qty *</label>
              <input type="number" step="0.001" min="0" value={form.actual_output_qty} required
                onChange={(e) => setForm({ ...form, actual_output_qty: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Wastage Qty (process loss)</label>
              <input type="number" step="0.001" min="0" value={form.wastage_qty}
                onChange={(e) => setForm({ ...form, wastage_qty: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">Inputs Consumed (actuals) *</label>
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
                  <input type="number" step="0.001" min="0" placeholder="Qty" value={row.qty_consumed}
                    className={`col-span-3 ${smallCls}`}
                    onChange={(e) => updateInput(idx, { qty_consumed: e.target.value })} />
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
          <div className="flex gap-3 pt-4 justify-end">
            <button type="button" onClick={() => setIsModalOpen(false)}
              className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
              {isSubmitting ? 'Saving...' : editItem ? 'Update Run' : 'Record Run'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteItem}
        title="Delete Production Run"
        message="Delete this run? Its stock effect (inputs consumed + output produced) will be reversed."
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
        variant="danger"
        confirmText="Delete"
      />
    </div>
  );
}
