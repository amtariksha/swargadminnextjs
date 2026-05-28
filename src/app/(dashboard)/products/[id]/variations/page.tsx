'use client';

/**
 * Variation editor for one product.
 *
 *   /products/:id/variations
 *
 * Sections:
 *   1. Attribute Assignments — which global/local attributes apply, with
 *      "Used for variations" + "Visible" flags and value subset per attribute.
 *   2. Generate — Cartesian generation of every combination (hard cap 500
 *      enforced by backend; soft warn at 100).
 *   3. Active Variants — table with inline edit (price, sku, stock, default).
 *   4. Bulk Edit — apply price/stock/active changes to selected variants.
 *   5. Archived — collapsed panel showing soft-deleted variants (D-12).
 */

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    ArrowLeft, Plus, Layers, Trash2, Sparkles, Edit3, Star, Archive,
} from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useProduct } from '@/hooks/useData';
import {
    useAttributes,
    useProductAttributes,
    useSetProductAttributes,
    useVariants,
    useGenerateVariants,
    useUpdateVariant,
    useArchiveVariant,
    useBulkEditVariants,
} from '@/hooks/useVariations';
import type { Attribute, Variant, AttributeValue, ProductAttributeAssignment } from '@/lib/types/variations';
import { ApiError } from '@/lib/api';

export default function ProductVariationsPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const productId = parseInt(params.id, 10);

    const { data: product } = useProduct(productId);
    const { data: assignments = [], isLoading: assignmentsLoading } = useProductAttributes(productId);
    const { data: variants = [], isLoading: variantsLoading } = useVariants(productId, true);

    const [showAttributesModal, setShowAttributesModal] = useState(false);
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [selectedVariantIds, setSelectedVariantIds] = useState<Set<number>>(new Set());
    const [archiveTarget, setArchiveTarget] = useState<Variant | null>(null);

    const activeVariants = useMemo(() => variants.filter((v) => v.archived_at == null), [variants]);
    const archivedVariants = useMemo(() => variants.filter((v) => v.archived_at != null), [variants]);
    const variationDefiningAssignments = useMemo(
        () => assignments.filter((a) => a.is_variation_defining === 1),
        [assignments],
    );

    const updateVariantMut = useUpdateVariant();
    const archiveVariantMut = useArchiveVariant();

    const onToggleSelect = (id: number) => {
        setSelectedVariantIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const onSelectAll = () => {
        if (selectedVariantIds.size === activeVariants.length) setSelectedVariantIds(new Set());
        else setSelectedVariantIds(new Set(activeVariants.map((v) => v.id)));
    };

    const onSetDefault = async (v: Variant) => {
        try {
            await updateVariantMut.mutateAsync({
                productId, variantId: v.id, is_default: 1,
            });
            toast.success(`"${describeVariant(v)}" is now the default variant`);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Failed');
        }
    };

    const onArchive = async () => {
        if (!archiveTarget) return;
        try {
            await archiveVariantMut.mutateAsync({ productId, variantId: archiveTarget.id });
            toast.success('Variant archived');
            setArchiveTarget(null);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Archive failed');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <button onClick={() => router.push(`/products/${productId}`)}
                    className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">{product?.title || `Product #${productId}`}</h1>
                    <p className="text-slate-400 text-sm">Variations editor</p>
                </div>
            </div>

            {/* Section 1 — Attribute Assignments */}
            <section className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Attributes</h2>
                        <p className="text-slate-500 text-xs">Variation-defining attributes drive the Cartesian product. Display-only attributes appear under the product description.</p>
                    </div>
                    <button onClick={() => setShowAttributesModal(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-200 rounded-lg text-sm hover:border-purple-500/50">
                        <Edit3 className="w-4 h-4" /> Manage
                    </button>
                </div>
                {assignmentsLoading ? (
                    <div className="text-slate-500 text-sm">Loading…</div>
                ) : assignments.length === 0 ? (
                    <div className="text-slate-500 text-sm italic">No attributes assigned. Click <span className="text-purple-400">Manage</span> to add Size, Colour, Flavour, etc.</div>
                ) : (
                    <ul className="space-y-2">
                        {assignments.map((a) => (
                            <li key={a.attribute_id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium">{a.name}</span>
                                        {a.is_variation_defining === 1 ? (
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">Variation-defining</span>
                                        ) : (
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">Display only</span>
                                        )}
                                        {a.is_visible === 1 && (
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/30 text-slate-400">Visible</span>
                                        )}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {(a.values || []).map((v) => (
                                            <span key={v.product_attribute_value_id}
                                                className="text-xs px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300">
                                                {v.value}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Section 2 — Generate */}
            {variationDefiningAssignments.length > 0 && (
                <section className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-white">Generate variants</h2>
                            <p className="text-slate-500 text-xs">Creates every combination of selected values. Skips duplicates of existing variants.</p>
                        </div>
                        <button onClick={() => setShowGenerateModal(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm">
                            <Sparkles className="w-4 h-4" /> Generate
                        </button>
                    </div>
                </section>
            )}

            {/* Section 3 — Active variants */}
            <section className="rounded-xl border border-slate-800/50 bg-slate-900/50">
                <div className="flex items-center justify-between p-5 border-b border-slate-800/50">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Variants ({activeVariants.length})</h2>
                        <p className="text-slate-500 text-xs">Inline-edit price, SKU, and stock. Set a default for legacy clients to see.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={selectedVariantIds.size === 0}
                            onClick={() => setShowBulkModal(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-200 rounded-lg text-sm disabled:opacity-50 hover:border-purple-500/50">
                            <Layers className="w-4 h-4" /> Bulk edit ({selectedVariantIds.size})
                        </button>
                    </div>
                </div>
                {variantsLoading ? (
                    <div className="p-8 text-slate-500 text-sm">Loading…</div>
                ) : activeVariants.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 text-sm">
                        No variants yet. {variationDefiningAssignments.length > 0
                            ? 'Click Generate to create them from the attribute matrix.'
                            : 'Add at least one variation-defining attribute first.'}
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs uppercase text-slate-500 border-b border-slate-800/50">
                                <th className="px-3 py-2 w-10">
                                    <input type="checkbox"
                                        checked={selectedVariantIds.size === activeVariants.length && activeVariants.length > 0}
                                        onChange={onSelectAll} />
                                </th>
                                <th className="px-3 py-2 text-left font-medium">Combination</th>
                                <th className="px-3 py-2 text-left font-medium">SKU</th>
                                <th className="px-3 py-2 text-left font-medium">Regular price</th>
                                <th className="px-3 py-2 text-left font-medium">Sale price</th>
                                <th className="px-3 py-2 text-left font-medium">Stock</th>
                                <th className="px-3 py-2 text-left font-medium">Status</th>
                                <th className="px-3 py-2 text-left font-medium">Default</th>
                                <th className="px-3 py-2 w-24"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeVariants.map((v) => (
                                <VariantRow
                                    key={v.id}
                                    variant={v}
                                    productId={productId}
                                    selected={selectedVariantIds.has(v.id)}
                                    onToggleSelect={() => onToggleSelect(v.id)}
                                    onSetDefault={() => onSetDefault(v)}
                                    onArchive={() => setArchiveTarget(v)}
                                />
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {/* Section 4 — Archived variants */}
            {archivedVariants.length > 0 && (
                <section className="rounded-xl border border-slate-800/50 bg-slate-900/30">
                    <button onClick={() => setShowArchived((x) => !x)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors">
                        <div className="flex items-center gap-2">
                            <Archive className="w-4 h-4 text-amber-400" />
                            <span className="text-sm text-slate-300">Archived variants ({archivedVariants.length})</span>
                        </div>
                        <span className="text-xs text-slate-500">{showArchived ? 'Hide' : 'Show'}</span>
                    </button>
                    {showArchived && (
                        <table className="w-full border-t border-slate-800/50">
                            <thead>
                                <tr className="text-xs uppercase text-slate-500 border-b border-slate-800/50">
                                    <th className="px-3 py-2 text-left font-medium">Combination</th>
                                    <th className="px-3 py-2 text-left font-medium">SKU</th>
                                    <th className="px-3 py-2 text-left font-medium">Regular price</th>
                                    <th className="px-3 py-2 text-left font-medium">Archived at</th>
                                </tr>
                            </thead>
                            <tbody>
                                {archivedVariants.map((v) => (
                                    <tr key={v.id} className="border-b border-slate-800/30 text-slate-500">
                                        <td className="px-3 py-2 text-sm">{describeVariant(v)}</td>
                                        <td className="px-3 py-2 text-sm"><code className="text-xs">{v.sku || '—'}</code></td>
                                        <td className="px-3 py-2 text-sm">{v.regular_price ?? '—'}</td>
                                        <td className="px-3 py-2 text-xs">{v.archived_at?.slice(0, 19) || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>
            )}

            {showAttributesModal && (
                <AttributeAssignmentModal
                    productId={productId}
                    existing={assignments}
                    onClose={() => setShowAttributesModal(false)}
                />
            )}

            {showGenerateModal && (
                <GenerateModal
                    productId={productId}
                    assignments={variationDefiningAssignments}
                    onClose={() => setShowGenerateModal(false)}
                />
            )}

            {showBulkModal && (
                <BulkEditModal
                    productId={productId}
                    variantIds={Array.from(selectedVariantIds)}
                    onClose={() => { setShowBulkModal(false); setSelectedVariantIds(new Set()); }}
                />
            )}

            <ConfirmDialog isOpen={!!archiveTarget}
                title="Archive variant"
                message={`Archive "${archiveTarget ? describeVariant(archiveTarget) : ''}"? Historic orders still reference it; it becomes read-only.`}
                onConfirm={onArchive} onCancel={() => setArchiveTarget(null)}
                variant="danger" confirmText="Archive" />
        </div>
    );
}

/* ─── Helpers ─── */

function describeVariant(v: Variant): string {
    if (!v.attribute_pairs || v.attribute_pairs.length === 0) return v.slug;
    return v.attribute_pairs.map((p) => p.value ?? '?').filter(Boolean).join(' · ');
}

/* ─── Inline-editable variant row ─── */

function VariantRow({
    variant, productId, selected, onToggleSelect, onSetDefault, onArchive,
}: {
    variant: Variant;
    productId: number;
    selected: boolean;
    onToggleSelect: () => void;
    onSetDefault: () => void;
    onArchive: () => void;
}) {
    const updateMut = useUpdateVariant();
    const [editing, setEditing] = useState({
        sku: variant.sku ?? '',
        regular_price: variant.regular_price?.toString() ?? '',
        sale_price: variant.sale_price?.toString() ?? '',
        stock_quantity: variant.stock_quantity?.toString() ?? '',
    });
    const [dirty, setDirty] = useState(false);

    const onSave = async () => {
        try {
            await updateMut.mutateAsync({
                productId,
                variantId: variant.id,
                sku: editing.sku.trim() || null,
                regular_price: editing.regular_price === '' ? null : parseFloat(editing.regular_price),
                sale_price: editing.sale_price === '' ? null : parseFloat(editing.sale_price),
                stock_quantity: editing.stock_quantity === '' ? null : parseInt(editing.stock_quantity, 10),
            });
            toast.success('Saved');
            setDirty(false);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Save failed');
        }
    };

    const setField = (key: keyof typeof editing, value: string) => {
        setEditing((s) => ({ ...s, [key]: value }));
        setDirty(true);
    };

    return (
        <tr className="border-b border-slate-800/30 hover:bg-slate-800/20">
            <td className="px-3 py-2"><input type="checkbox" checked={selected} onChange={onToggleSelect} /></td>
            <td className="px-3 py-2 text-sm text-slate-200">{describeVariant(variant)}</td>
            <td className="px-3 py-2">
                <input value={editing.sku} onChange={(e) => setField('sku', e.target.value)}
                    placeholder="—"
                    className="w-32 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
            </td>
            <td className="px-3 py-2">
                <input type="number" min={0} step="0.01" value={editing.regular_price}
                    onChange={(e) => setField('regular_price', e.target.value)}
                    placeholder="0"
                    className="w-24 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
            </td>
            <td className="px-3 py-2">
                <input type="number" min={0} step="0.01" value={editing.sale_price}
                    onChange={(e) => setField('sale_price', e.target.value)}
                    placeholder="—"
                    className="w-24 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
            </td>
            <td className="px-3 py-2">
                <input type="number" min={0} value={editing.stock_quantity}
                    onChange={(e) => setField('stock_quantity', e.target.value)}
                    placeholder="—"
                    className="w-20 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
            </td>
            <td className="px-3 py-2 text-xs">
                <span className={
                    variant.stock_status === 'in_stock' ? 'text-emerald-400' :
                    variant.stock_status === 'out_of_stock' ? 'text-red-400' : 'text-amber-400'
                }>{variant.stock_status.replace('_', ' ')}</span>
            </td>
            <td className="px-3 py-2">
                {variant.is_default === 1 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                        <Star className="w-3 h-3 fill-amber-400" /> default
                    </span>
                ) : (
                    <button onClick={onSetDefault}
                        className="text-xs text-slate-500 hover:text-amber-400">Make default</button>
                )}
            </td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                    {dirty && (
                        <button onClick={onSave} disabled={updateMut.isPending}
                            className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs border border-purple-500/30 hover:bg-purple-500/30">
                            Save
                        </button>
                    )}
                    <button onClick={onArchive}
                        className="p-1.5 hover:bg-red-500/20 rounded" title="Archive">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                </div>
            </td>
        </tr>
    );
}

/* ─── Modal: pick attributes + values for this product ─── */

function AttributeAssignmentModal({
    productId, existing, onClose,
}: {
    productId: number;
    existing: ProductAttributeAssignment[];
    onClose: () => void;
}) {
    const { data: library = [] } = useAttributes({ includeValues: true });
    const setMut = useSetProductAttributes();

    const existingByAttrId = useMemo(() => {
        const m = new Map<number, ProductAttributeAssignment>();
        for (const a of existing) m.set(a.attribute_id, a);
        return m;
    }, [existing]);

    const [draft, setDraft] = useState(() => library.map((attr) => {
        const ex = existingByAttrId.get(attr.id);
        const selectedValueIds = new Set((ex?.values || []).map((v) => v.attribute_value_id));
        return {
            attribute_id: attr.id,
            name: attr.name,
            values: attr.values || [],
            assigned: !!ex,
            is_variation_defining: ex ? ex.is_variation_defining === 1 : true,
            is_visible: ex ? ex.is_visible === 1 : true,
            selectedValueIds,
        };
    }));

    // Re-sync when library loads or existing changes (best-effort).
    useMemo(() => {
        if (library.length > 0 && draft.length === 0) {
            setDraft(library.map((attr) => {
                const ex = existingByAttrId.get(attr.id);
                return {
                    attribute_id: attr.id,
                    name: attr.name,
                    values: attr.values || [],
                    assigned: !!ex,
                    is_variation_defining: ex ? ex.is_variation_defining === 1 : true,
                    is_visible: ex ? ex.is_visible === 1 : true,
                    selectedValueIds: new Set((ex?.values || []).map((v) => v.attribute_value_id)),
                };
            }));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [library.length]);

    const onSave = async () => {
        const payload = draft
            .filter((d) => d.assigned && d.selectedValueIds.size > 0)
            .map((d) => ({
                attribute_id: d.attribute_id,
                is_variation_defining: d.is_variation_defining,
                is_visible: d.is_visible,
                value_ids: Array.from(d.selectedValueIds),
            }));
        try {
            await setMut.mutateAsync({ productId, payload });
            toast.success('Attributes saved');
            onClose();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Save failed');
        }
    };

    const toggleAssigned = (idx: number) => {
        setDraft((d) => d.map((row, i) => i === idx ? { ...row, assigned: !row.assigned } : row));
    };
    const toggleVD = (idx: number) => {
        setDraft((d) => d.map((row, i) => i === idx ? { ...row, is_variation_defining: !row.is_variation_defining } : row));
    };
    const toggleVisible = (idx: number) => {
        setDraft((d) => d.map((row, i) => i === idx ? { ...row, is_visible: !row.is_visible } : row));
    };
    const toggleValue = (idx: number, valueId: number) => {
        setDraft((d) => d.map((row, i) => {
            if (i !== idx) return row;
            const next = new Set(row.selectedValueIds);
            if (next.has(valueId)) next.delete(valueId);
            else next.add(valueId);
            return { ...row, selectedValueIds: next };
        }));
    };

    return (
        <Modal isOpen onClose={onClose} title="Manage product attributes">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {draft.length === 0 && (
                    <div className="text-slate-500 text-sm">
                        No attributes in the library yet. Add some at <a href="/attributes" className="text-purple-400 underline">/attributes</a>.
                    </div>
                )}
                {draft.map((row, idx) => (
                    <div key={row.attribute_id}
                        className={`rounded-lg border ${row.assigned ? 'border-purple-500/30 bg-purple-500/5' : 'border-slate-800/50'} p-3`}>
                        <div className="flex items-center gap-3">
                            <input type="checkbox" checked={row.assigned}
                                onChange={() => toggleAssigned(idx)} />
                            <span className="text-white font-medium flex-1">{row.name}</span>
                            {row.assigned && (
                                <>
                                    <label className="flex items-center gap-1 text-xs text-slate-300">
                                        <input type="checkbox" checked={row.is_variation_defining}
                                            onChange={() => toggleVD(idx)} />
                                        Used for variations
                                    </label>
                                    <label className="flex items-center gap-1 text-xs text-slate-300">
                                        <input type="checkbox" checked={row.is_visible}
                                            onChange={() => toggleVisible(idx)} />
                                        Visible
                                    </label>
                                </>
                            )}
                        </div>
                        {row.assigned && (
                            <div className="mt-3 flex flex-wrap gap-1">
                                {row.values.map((v: AttributeValue) => (
                                    <button key={v.id} type="button"
                                        onClick={() => toggleValue(idx, v.id)}
                                        className={`text-xs px-2 py-1 rounded-full border ${
                                            row.selectedValueIds.has(v.id)
                                                ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                                                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white'
                                        }`}>
                                        {v.value}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-800/50 mt-4">
                <div className="flex-1" />
                <button type="button" onClick={onClose}
                    className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">
                    Cancel
                </button>
                <button type="button" onClick={onSave} disabled={setMut.isPending}
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                    {setMut.isPending ? 'Saving…' : 'Save'}
                </button>
            </div>
        </Modal>
    );
}

/* ─── Modal: generate variants ─── */

function GenerateModal({
    productId, assignments, onClose,
}: {
    productId: number;
    assignments: ProductAttributeAssignment[];
    onClose: () => void;
}) {
    const generateMut = useGenerateVariants();
    const [confirmedAtVolume, setConfirmedAtVolume] = useState(false);

    const valueIdsByAttr = useMemo(() => assignments.map((a) => ({
        attribute_id: a.attribute_id,
        name: a.name,
        value_ids: (a.values || []).map((v) => v.attribute_value_id),
    })), [assignments]);

    const predicted = valueIdsByAttr.reduce((acc, a) => acc * Math.max(1, a.value_ids.length), 1);
    const needsConfirm = predicted > 100;
    const overCap = predicted > 500;

    const onGenerate = async () => {
        try {
            const res = await generateMut.mutateAsync({
                productId,
                payload: { attributes: valueIdsByAttr.map(({ attribute_id, value_ids }) => ({ attribute_id, value_ids })) },
            });
            toast.success(`Created ${res.created} variants${res.skipped ? `, skipped ${res.skipped} duplicates` : ''}.`);
            onClose();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Generation failed');
        }
    };

    return (
        <Modal isOpen onClose={onClose} title="Generate variants">
            <div className="space-y-4">
                <p className="text-slate-300 text-sm">
                    Will create the Cartesian product of:
                </p>
                <ul className="space-y-1 text-sm">
                    {valueIdsByAttr.map((a) => (
                        <li key={a.attribute_id} className="text-slate-400">
                            <span className="text-white">{a.name}</span> <span className="text-slate-500">×</span> <span className="text-purple-300">{a.value_ids.length} values</span>
                        </li>
                    ))}
                </ul>
                <div className={`p-3 rounded-lg border ${overCap ? 'border-red-500/40 bg-red-500/10' : needsConfirm ? 'border-amber-500/40 bg-amber-500/10' : 'border-slate-700/50 bg-slate-800/30'}`}>
                    <p className="text-sm text-white">Predicted: <strong>{predicted}</strong> variants.</p>
                    {overCap && (
                        <p className="text-xs text-red-300 mt-1">
                            Exceeds hard cap of 500. Reduce attribute values before generating.
                        </p>
                    )}
                    {needsConfirm && !overCap && (
                        <label className="flex items-center gap-2 mt-2 text-xs text-amber-200">
                            <input type="checkbox" checked={confirmedAtVolume}
                                onChange={(e) => setConfirmedAtVolume(e.target.checked)} />
                            I confirm I want to generate {predicted} variants.
                        </label>
                    )}
                </div>
                <p className="text-xs text-slate-500">
                    Duplicates of existing variants are skipped automatically. New variants are created with no price — set prices via bulk-edit before publishing.
                </p>
                <div className="flex gap-3 pt-2">
                    <div className="flex-1" />
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">
                        Cancel
                    </button>
                    <button type="button" onClick={onGenerate}
                        disabled={overCap || (needsConfirm && !confirmedAtVolume) || generateMut.isPending}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                        {generateMut.isPending ? 'Generating…' : `Generate ${predicted}`}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

/* ─── Modal: bulk edit ─── */

function BulkEditModal({
    productId, variantIds, onClose,
}: {
    productId: number;
    variantIds: number[];
    onClose: () => void;
}) {
    const bulkMut = useBulkEditVariants();
    const [form, setForm] = useState({
        regular_price: '',
        sale_price: '',
        stock_quantity: '',
        stock_status: '',
        is_active: '',
    });

    const onApply = async () => {
        const changes: Record<string, unknown> = {};
        if (form.regular_price !== '') changes.regular_price = parseFloat(form.regular_price);
        if (form.sale_price !== '') changes.sale_price = parseFloat(form.sale_price);
        if (form.stock_quantity !== '') changes.stock_quantity = parseInt(form.stock_quantity, 10);
        if (form.stock_status !== '') changes.stock_status = form.stock_status;
        if (form.is_active !== '') changes.is_active = parseInt(form.is_active, 10);

        if (Object.keys(changes).length === 0) {
            toast.error('No changes specified');
            return;
        }

        try {
            const res = await bulkMut.mutateAsync({ productId, variant_ids: variantIds, changes });
            toast.success(`Updated ${res.updated} variants`);
            onClose();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Bulk edit failed');
        }
    };

    return (
        <Modal isOpen onClose={onClose} title={`Bulk edit · ${variantIds.length} variant${variantIds.length === 1 ? '' : 's'}`}>
            <div className="space-y-4">
                <p className="text-slate-400 text-xs">Leave a field blank to skip it. Fields set here overwrite the variant's existing value.</p>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Regular price</label>
                        <input type="number" step="0.01" min={0}
                            value={form.regular_price}
                            onChange={(e) => setForm({ ...form, regular_price: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Sale price</label>
                        <input type="number" step="0.01" min={0}
                            value={form.sale_price}
                            onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Stock quantity</label>
                        <input type="number" min={0}
                            value={form.stock_quantity}
                            onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Stock status</label>
                        <select value={form.stock_status}
                            onChange={(e) => setForm({ ...form, stock_status: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white">
                            <option value="">— no change —</option>
                            <option value="in_stock">In stock</option>
                            <option value="out_of_stock">Out of stock</option>
                            <option value="on_backorder">On backorder</option>
                        </select>
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-300 mb-2">Active</label>
                        <select value={form.is_active}
                            onChange={(e) => setForm({ ...form, is_active: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white">
                            <option value="">— no change —</option>
                            <option value="1">Active</option>
                            <option value="0">Inactive</option>
                        </select>
                    </div>
                </div>
                <div className="flex gap-3 pt-2">
                    <div className="flex-1" />
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">
                        Cancel
                    </button>
                    <button type="button" onClick={onApply} disabled={bulkMut.isPending}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                        {bulkMut.isPending ? 'Applying…' : `Apply to ${variantIds.length}`}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
