'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';
import { Search, X } from 'lucide-react';

interface Customer {
    id: number;
    name?: string;
    phone?: string;
}

interface CustomerMultiSelectProps {
    value: number[];
    onChange: (ids: number[]) => void;
}

/**
 * Searchable customer multi-select for the broadcast composer's custom
 * audience. Fetches the customer list once and filters client-side.
 */
export default function CustomerMultiSelect({
    value,
    onChange,
}: CustomerMultiSelectProps) {
    const [search, setSearch] = useState('');

    const { data: customers = [], isLoading } = useQuery({
        queryKey: ['broadcast-customers'],
        queryFn: async () => (await GET<Customer[]>('/get_user')).data || [],
    });

    const selected = useMemo(() => new Set(value), [value]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const base = q
            ? customers.filter(
                  (c) =>
                      (c.name || '').toLowerCase().includes(q) ||
                      (c.phone || '').includes(q),
              )
            : customers;
        return base.slice(0, 50);
    }, [customers, search]);

    const selectedCustomers = useMemo(
        () => customers.filter((c) => selected.has(c.id)),
        [customers, selected],
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
                    {value.length} customer{value.length === 1 ? '' : 's'} selected
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

            {selectedCustomers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {selectedCustomers.map((c) => (
                        <span
                            key={c.id}
                            className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 border border-purple-500/40 rounded-lg text-xs text-white"
                        >
                            {c.name || `#${c.id}`}
                            <button
                                type="button"
                                onClick={() => toggle(c.id)}
                                aria-label="Remove"
                            >
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
                    placeholder="Search customers by name or phone"
                    className="w-full pl-9 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm"
                />
            </div>

            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-700/50 divide-y divide-slate-800">
                {isLoading ? (
                    <p className="p-3 text-sm text-slate-500">Loading customers…</p>
                ) : filtered.length === 0 ? (
                    <p className="p-3 text-sm text-slate-500">No customers found</p>
                ) : (
                    filtered.map((c) => (
                        <label
                            key={c.id}
                            className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-slate-800/50"
                        >
                            <input
                                type="checkbox"
                                checked={selected.has(c.id)}
                                onChange={() => toggle(c.id)}
                            />
                            <span className="text-sm text-white">
                                {c.name || `Customer #${c.id}`}
                            </span>
                            {c.phone && (
                                <span className="text-xs text-slate-500">{c.phone}</span>
                            )}
                        </label>
                    ))
                )}
            </div>
            {search.trim() === '' && customers.length > 50 && (
                <p className="text-xs text-slate-500">
                    Showing first 50 — search to narrow the list.
                </p>
            )}
        </div>
    );
}
