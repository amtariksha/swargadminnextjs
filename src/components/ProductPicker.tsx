'use client';

/**
 * ProductPicker — a searchable product combobox.
 *
 * The catalog is loaded unpaginated (useProducts → GET /get_product), so a
 * native <select> means scrolling several hundred <option>s to find one SKU.
 * This filters as you type, on title and slug.
 *
 * Mirrors LedgerPicker / CustomerPicker: same click-outside handling, same dark
 * glass styling, same shape of props. Price context (MRP / B2B default) is shown
 * inline because the only callers today are pricing screens, where "what is it
 * normally?" is the question you are answering while you pick.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { inputClassName } from '@/components/FormField';
import { useProducts, type Product } from '@/hooks/useData';
import { formatINR } from '@/lib/accounting';

interface ProductPickerProps {
    value: number | null;
    onChange: (product: Product | null) => void;
    /** Hide products already priced on this screen. */
    excludeIds?: number[];
    placeholder?: string;
    disabled?: boolean;
    /** Show MRP / B2B default next to each row. On by default. */
    showPrices?: boolean;
}

export default function ProductPicker({
    value,
    onChange,
    excludeIds = [],
    placeholder = 'Select a product…',
    disabled,
    showPrices = true,
}: ProductPickerProps) {
    const { data: products = [], isLoading } = useProducts();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const selected = useMemo(() => products.find((p) => p.id === value) || null, [products, value]);

    const matches = useMemo(() => {
        const q = search.trim().toLowerCase();
        const excluded = new Set(excludeIds);
        return products
            .filter((p) => !excluded.has(p.id))
            .filter((p) => !q
                || p.title?.toLowerCase().includes(q)
                || p.slug?.toLowerCase().includes(q))
            .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }, [products, search, excludeIds]);

    const priceHint = (p: Product) => {
        if (!showPrices) return null;
        const parts = [
            p.b2b_price != null ? `B2B ${formatINR(p.b2b_price)}` : null,
            p.mrp != null ? `MRP ${formatINR(p.mrp)}` : null,
        ].filter(Boolean);
        return parts.length ? <span className="text-slate-500 text-xs"> · {parts.join(' · ')}</span> : null;
    };

    const pick = (p: Product) => {
        onChange(p);
        setOpen(false);
        setSearch('');
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
                className={`${inputClassName} flex items-center justify-between text-left disabled:opacity-60`}
            >
                <span className={selected ? 'text-white truncate' : 'text-slate-500'}>
                    {selected ? <>{selected.title}{priceHint(selected)}</> : placeholder}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 left-0 right-0 bg-slate-800 border border-slate-700 rounded-xl shadow-xl">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
                        <Search className="w-4 h-4 text-slate-400" />
                        <input
                            autoFocus
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search product…"
                            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                        />
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                        {isLoading && <p className="px-3 py-3 text-sm text-slate-500">Loading…</p>}
                        {!isLoading && matches.length === 0 && (
                            <p className="px-3 py-3 text-sm text-slate-500">No matching products</p>
                        )}
                        {matches.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => pick(p)}
                                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-700/60 ${p.id === value ? 'text-purple-300' : 'text-slate-200'}`}
                            >
                                {p.title}
                                {priceHint(p)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
