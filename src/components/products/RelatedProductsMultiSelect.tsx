'use client';

import { useMemo, useState } from 'react';
import { useProducts } from '@/hooks/useData';
import { Search, X } from 'lucide-react';

interface RelatedProductsMultiSelectProps {
    value: number[];
    onChange: (ids: number[]) => void;
    excludeId?: number;
}

/**
 * Searchable related-products picker for the product form (Phase 2). Fetches
 * the product list once and filters client-side; excludes the current product.
 * Mirrors CustomerMultiSelect.
 */
export default function RelatedProductsMultiSelect({
    value,
    onChange,
    excludeId,
}: RelatedProductsMultiSelectProps) {
    const { data: products = [], isLoading } = useProducts();
    const [search, setSearch] = useState('');
    const selected = useMemo(() => new Set(value), [value]);

    const pool = useMemo(
        () => products.filter((p) => p.id !== excludeId),
        [products, excludeId],
    );
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const base = q ? pool.filter((p) => (p.title || '').toLowerCase().includes(q)) : pool;
        return base.slice(0, 50);
    }, [pool, search]);
    const selectedProducts = useMemo(
        () => products.filter((p) => selected.has(p.id)),
        [products, selected],
    );

    const toggle = (id: number) => {
        const next = new Set(value);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange([...next]);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                    {value.length} product{value.length === 1 ? '' : 's'} selected
                </span>
                {value.length > 0 && (
                    <button
                        type="button"
                        onClick={() => onChange([])}
                        className="text-xs text-pink-400 hover:text-pink-300"
                    >
                        Clear all
                    </button>
                )}
            </div>

            {selectedProducts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {selectedProducts.map((p) => (
                        <span
                            key={p.id}
                            className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 border border-purple-500/40 rounded-lg text-xs text-white"
                        >
                            {p.title || `#${p.id}`}
                            <button type="button" onClick={() => toggle(p.id)} aria-label="Remove">
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search products by title"
                    className="w-full pl-9 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm"
                />
            </div>

            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-700/50 divide-y divide-slate-800">
                {isLoading ? (
                    <p className="p-3 text-sm text-slate-500">Loading products…</p>
                ) : filtered.length === 0 ? (
                    <p className="p-3 text-sm text-slate-500">No products found</p>
                ) : (
                    filtered.map((p) => (
                        <label
                            key={p.id}
                            className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-slate-800/50"
                        >
                            <input
                                type="checkbox"
                                checked={selected.has(p.id)}
                                onChange={() => toggle(p.id)}
                            />
                            <span className="text-sm text-white">{p.title || `Product #${p.id}`}</span>
                        </label>
                    ))
                )}
            </div>
            {search.trim() === '' && pool.length > 50 && (
                <p className="text-xs text-slate-500">Showing first 50 — search to narrow the list.</p>
            )}
        </div>
    );
}
