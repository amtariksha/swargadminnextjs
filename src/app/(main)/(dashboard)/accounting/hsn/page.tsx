'use client';

import { useMemo, useState } from 'react';
import {
    useHsnCodes, useProductsWithGst, HsnCode, HsnRate, ProductGst,
} from '@/hooks/useAccounting';
import { formatPercent } from '@/lib/accounting';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import TabPanel from '@/components/TabPanel';
import { Plus, Trash2, Star, Tag, Package, Search, Link2 } from 'lucide-react';
import { POST, PUT, DELETE } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
    'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

/** A flat rate option used by the product-mapping picker — "HSN 0401 @ 5%". */
interface RateOption {
    rate: HsnRate;
    code: string;
}

export default function AccountingHsnPage() {
    const { data: hsnCodes = [], isLoading, refetch } = useHsnCodes();
    const [activeTab, setActiveTab] = useState(0);

    const rateOptions: RateOption[] = useMemo(
        () => hsnCodes.flatMap((h) => h.rates.map((rate) => ({ rate, code: h.code }))),
        [hsnCodes],
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">HSN &amp; GST Rates</h1>
                <p className="text-slate-400">
                    Add HSN codes, attach one or more GST rates to each, then map products to a specific HSN + rate.
                </p>
            </div>

            <TabPanel
                activeTab={activeTab}
                onChange={setActiveTab}
                tabs={[
                    {
                        label: 'HSN Codes & Rates',
                        count: hsnCodes.length,
                        content: <HsnCodesTab hsnCodes={hsnCodes} isLoading={isLoading} refetch={refetch} />,
                    },
                    {
                        label: 'Map Products',
                        content: <MapProductsTab rateOptions={rateOptions} refetchHsn={refetch} />,
                    },
                ]}
            />
        </div>
    );
}

// ── Tab 1: HSN codes + their rates ───────────────────────────────────────────

function HsnCodesTab({
    hsnCodes, isLoading, refetch,
}: {
    hsnCodes: HsnCode[];
    isLoading: boolean;
    refetch: () => void;
}) {
    const [showAddHsn, setShowAddHsn] = useState(false);
    const [codeForm, setCodeForm] = useState({ code: '', description: '' });
    const [rateModalHsn, setRateModalHsn] = useState<HsnCode | null>(null);
    const [rateForm, setRateForm] = useState({ gst_rate: '', label: '', is_default: false });
    const [deleteRate, setDeleteRate] = useState<HsnRate | null>(null);
    const [busy, setBusy] = useState(false);

    const addHsn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!codeForm.code.trim()) return;
        setBusy(true);
        try {
            await POST('/accounting/hsn', {
                code: codeForm.code.trim(),
                description: codeForm.description.trim() || null,
            });
            toast.success('HSN code added');
            setShowAddHsn(false);
            setCodeForm({ code: '', description: '' });
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to add HSN');
        } finally {
            setBusy(false);
        }
    };

    const addRate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rateModalHsn || rateForm.gst_rate === '') return;
        setBusy(true);
        try {
            await POST(`/accounting/hsn/${rateModalHsn.id}/rates`, {
                gst_rate: Number(rateForm.gst_rate),
                label: rateForm.label.trim() || null,
                is_default: rateForm.is_default ? 1 : 0,
            });
            toast.success('Rate added');
            setRateModalHsn(null);
            setRateForm({ gst_rate: '', label: '', is_default: false });
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to add rate');
        } finally {
            setBusy(false);
        }
    };

    const toggleHsnActive = async (h: HsnCode) => {
        try {
            await PUT(`/accounting/hsn/${h.id}`, { description: h.description, is_active: h.is_active ? 0 : 1 });
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update');
        }
    };

    const setRateDefault = async (rate: HsnRate) => {
        try {
            await PUT(`/accounting/hsn/rates/${rate.id}`, {
                label: rate.label, is_default: 1, is_active: rate.is_active,
            });
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to set default');
        }
    };

    const confirmDeleteRate = async () => {
        if (!deleteRate) return;
        setBusy(true);
        try {
            await DELETE(`/accounting/hsn/rates/${deleteRate.id}`);
            toast.success('Rate removed');
            setDeleteRate(null);
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Cannot remove rate in use');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button onClick={() => setShowAddHsn(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm">
                    <Plus className="w-4 h-4" /> Add HSN code
                </button>
            </div>

            {isLoading ? (
                <div className="text-slate-400 text-sm py-8 text-center">Loading…</div>
            ) : hsnCodes.length === 0 ? (
                <div className="glass rounded-2xl p-8 text-center text-slate-400 text-sm">
                    No HSN codes yet. Add one to start mapping products.
                </div>
            ) : (
                <div className="space-y-3">
                    {hsnCodes.map((h) => (
                        <div key={h.id} className="glass rounded-2xl p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Tag className="w-4 h-4 text-purple-400" />
                                        <span className="font-semibold text-white text-lg">{h.code}</span>
                                        {!h.is_active && (
                                            <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700/50 text-slate-400">Inactive</span>
                                        )}
                                    </div>
                                    {h.description && <p className="text-sm text-slate-400 mt-0.5">{h.description}</p>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button onClick={() => toggleHsnActive(h)}
                                        className="px-3 py-1.5 text-xs bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700/50">
                                        {h.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button onClick={() => { setRateModalHsn(h); setRateForm({ gst_rate: '', label: '', is_default: false }); }}
                                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/30">
                                        <Plus className="w-3 h-3" /> Rate
                                    </button>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {h.rates.length === 0 ? (
                                    <span className="text-xs text-slate-500">No rates yet — add one before mapping products.</span>
                                ) : (
                                    h.rates.map((rate) => (
                                        <div key={rate.id}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                            <span className="text-sm font-medium text-white">{formatPercent(rate.gst_rate)}</span>
                                            {rate.label && <span className="text-xs text-slate-400">{rate.label}</span>}
                                            {rate.is_default
                                                ? <span className="flex items-center gap-1 text-xs text-amber-400"><Star className="w-3 h-3 fill-amber-400" /> default</span>
                                                : (
                                                    <button onClick={() => setRateDefault(rate)} title="Make default"
                                                        className="text-slate-500 hover:text-amber-400">
                                                        <Star className="w-3 h-3" />
                                                    </button>
                                                )}
                                            <span className="text-xs text-slate-500">· {rate.product_count} prod</span>
                                            {rate.product_count === 0 && (
                                                <button onClick={() => setDeleteRate(rate)} title="Remove rate"
                                                    className="text-slate-500 hover:text-red-400">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add HSN modal */}
            <Modal isOpen={showAddHsn} onClose={() => setShowAddHsn(false)} title="Add HSN code" size="md">
                <form onSubmit={addHsn} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">HSN code *</label>
                        <input type="text" value={codeForm.code} maxLength={8} placeholder="0401"
                            onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
                        <input type="text" value={codeForm.description} placeholder="Milk and cream, not concentrated"
                            onChange={(e) => setCodeForm({ ...codeForm, description: e.target.value })} className={inputCls} />
                    </div>
                    <div className="flex gap-3 pt-2 justify-end">
                        <button type="button" onClick={() => setShowAddHsn(false)}
                            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
                        <button type="submit" disabled={busy}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {busy ? 'Adding…' : 'Add'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Add rate modal */}
            <Modal isOpen={!!rateModalHsn} onClose={() => setRateModalHsn(null)}
                title={`Add rate — HSN ${rateModalHsn?.code ?? ''}`} size="md">
                <form onSubmit={addRate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">GST rate % *</label>
                            <input type="number" step="0.01" value={rateForm.gst_rate} placeholder="5"
                                onChange={(e) => setRateForm({ ...rateForm, gst_rate: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Label</label>
                            <input type="text" value={rateForm.label} placeholder="Standard"
                                onChange={(e) => setRateForm({ ...rateForm, label: e.target.value })} className={inputCls} />
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" checked={rateForm.is_default}
                            onChange={(e) => setRateForm({ ...rateForm, is_default: e.target.checked })}
                            className="w-4 h-4 rounded bg-slate-800 border-slate-600" />
                        Set as default rate for this HSN
                    </label>
                    <div className="flex gap-3 pt-2 justify-end">
                        <button type="button" onClick={() => setRateModalHsn(null)}
                            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
                        <button type="submit" disabled={busy}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {busy ? 'Adding…' : 'Add rate'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteRate}
                title="Remove GST rate"
                message={`Remove ${deleteRate ? formatPercent(deleteRate.gst_rate) : ''} rate? This cannot be undone.`}
                confirmText="Remove"
                variant="danger"
                isLoading={busy}
                onConfirm={confirmDeleteRate}
                onCancel={() => setDeleteRate(null)}
            />
        </div>
    );
}

// ── Tab 2: map products to a chosen HSN + rate ───────────────────────────────

function MapProductsTab({
    rateOptions, refetchHsn,
}: {
    rateOptions: RateOption[];
    refetchHsn: () => void;
}) {
    const [search, setSearch] = useState('');
    const [appliedQ, setAppliedQ] = useState('');
    const [onlyUnmapped, setOnlyUnmapped] = useState(false);
    const [selectedRateId, setSelectedRateId] = useState<number | ''>('');
    const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
    const [attaching, setAttaching] = useState(false);

    const filters: Record<string, string> = {};
    if (appliedQ) filters.q = appliedQ;
    if (onlyUnmapped) filters.unmapped = '1';
    const { data, isLoading, refetch } = useProductsWithGst(filters);
    const products = data?.data || [];

    const chosenRate = rateOptions.find((o) => o.rate.id === selectedRateId);
    const chosenLabel = chosenRate
        ? `HSN ${chosenRate.code} @ ${formatPercent(chosenRate.rate.gst_rate)}${chosenRate.rate.label ? ` (${chosenRate.rate.label})` : ''}`
        : '';

    const toggleProduct = (id: number) => {
        setSelectedProducts((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelectedProducts((prev) =>
            prev.size === products.length ? new Set() : new Set(products.map((p) => p.product_id)),
        );
    };

    const attach = async () => {
        if (selectedRateId === '' || selectedProducts.size === 0) return;
        setAttaching(true);
        try {
            const res = await POST<{ attached: number }>('/accounting/hsn/attach-products', {
                hsn_rate_id: selectedRateId,
                product_ids: Array.from(selectedProducts),
            });
            toast.success(`${res.data?.attached ?? selectedProducts.size} product(s) mapped to ${chosenLabel}`);
            setSelectedProducts(new Set());
            refetch();
            refetchHsn();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to attach products');
        } finally {
            setAttaching(false);
        }
    };

    const columns: Column<ProductGst>[] = [
        {
            key: 'select', header: '', width: '44px', sortable: false,
            render: (item) => (
                <input type="checkbox" checked={selectedProducts.has(item.product_id)}
                    onChange={() => toggleProduct(item.product_id)}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-600" />
            ),
        },
        { key: 'product_id', header: 'ID', width: '70px' },
        { key: 'title', header: 'Product' },
        {
            key: 'hsn_code', header: 'Current mapping',
            render: (item) => (
                item.hsn_rate_id
                    ? <span className="text-xs px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-300">
                        HSN {item.hsn_code} @ {formatPercent(item.gst_rate)}{item.rate_label ? ` (${item.rate_label})` : ''}
                    </span>
                    : <span className="text-xs text-slate-500">
                        Unmapped{item.legacy_tax != null ? ` · legacy tax ${formatPercent(item.legacy_tax)}` : ''}
                    </span>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            {/* Rate picker + attach bar */}
            <div className="glass rounded-2xl p-4 flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                        <Link2 className="w-4 h-4 text-purple-400" /> Map selected products to
                    </label>
                    <select value={selectedRateId}
                        onChange={(e) => setSelectedRateId(e.target.value === '' ? '' : Number(e.target.value))}
                        className={inputCls}>
                        <option value="">Choose HSN + rate…</option>
                        {rateOptions.map((o) => (
                            <option key={o.rate.id} value={o.rate.id}>
                                HSN {o.code} @ {formatPercent(o.rate.gst_rate)}{o.rate.label ? ` (${o.rate.label})` : ''}{o.rate.is_default ? ' ★' : ''}
                            </option>
                        ))}
                    </select>
                </div>
                <button onClick={attach} disabled={attaching || selectedRateId === '' || selectedProducts.size === 0}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-40 text-sm whitespace-nowrap">
                    <Package className="w-4 h-4" />
                    {attaching ? 'Mapping…' : `Map ${selectedProducts.size} product(s)`}
                </button>
            </div>

            {rateOptions.length === 0 && (
                <div className="text-xs text-amber-400/80 px-1">
                    No rates available yet — add an HSN code and a rate on the first tab before mapping products.
                </div>
            )}

            {/* Search */}
            <form onSubmit={(e) => { e.preventDefault(); setAppliedQ(search.trim()); }} className="flex gap-2 items-center">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search products (server-side)…"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
                <button type="submit" className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm hover:bg-slate-700/50">
                    Search
                </button>
                <label className="flex items-center gap-2 text-sm text-slate-300 ml-2">
                    <input type="checkbox" checked={onlyUnmapped} onChange={(e) => setOnlyUnmapped(e.target.checked)}
                        className="w-4 h-4 rounded bg-slate-800 border-slate-600" />
                    Unmapped only
                </label>
                {products.length > 0 && (
                    <button type="button" onClick={toggleAll}
                        className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm hover:bg-slate-700/50 ml-auto">
                        {selectedProducts.size === products.length ? 'Clear all' : 'Select all'}
                    </button>
                )}
            </form>

            <DataTable data={products} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Filter loaded rows..."
                emptyMessage="No products found (showing up to 500; use search to narrow)" />
        </div>
    );
}
