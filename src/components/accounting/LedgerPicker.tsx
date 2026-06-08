'use client';

/**
 * LedgerPicker — Phase 3.5 (accounting).
 *
 * A searchable ledger combobox that drills the full account-group hierarchy
 * (Primary ▸ Sub-group ▸ Ledger), instead of a flat <select>. Ledgers are
 * grouped under their deepest sub-group path so opening balances and the typed
 * voucher forms can pick exactly the right sub-ledger. Mirrors CustomerPicker's
 * click-outside + filter pattern.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { inputClassName } from '@/components/FormField';
import { useAccountGroups, useLedgerAccounts, type LedgerAccount } from '@/hooks/useAccounting';

export interface LedgerPickerValue {
    id: number;
    name: string;
}

interface LedgerPickerProps {
    value: number | null;
    onChange: (sel: LedgerPickerValue | null) => void;
    /** Hide ledgers already chosen elsewhere (e.g. other opening-balance rows). */
    excludeIds?: number[];
    /** Restrict to a subset — e.g. only bank/cash, or only a nature. */
    filter?: (ledger: LedgerAccount) => boolean;
    placeholder?: string;
    disabled?: boolean;
}

export default function LedgerPicker({
    value,
    onChange,
    excludeIds = [],
    filter,
    placeholder = 'Select ledger…',
    disabled,
}: LedgerPickerProps) {
    const { data: groups = [] } = useAccountGroups();
    const { data: ledgers = [], isLoading } = useLedgerAccounts();
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

    // Full group path (Primary ▸ Sub-group) for a given group id, walking parents.
    const pathOf = useMemo(() => {
        const byId = new Map(groups.map((g) => [g.id, g]));
        const cache = new Map<number, string>();
        const visiting = new Set<number>();
        const build = (gid: number | null): string => {
            if (gid == null || visiting.has(gid)) return '';  // cycle-safe
            if (cache.has(gid)) return cache.get(gid)!;
            const g = byId.get(gid);
            if (!g) return '';
            visiting.add(gid);
            const parent = build(g.parent_group_id);
            visiting.delete(gid);
            const path = parent ? `${parent} ▸ ${g.name}` : g.name;
            cache.set(gid, path);
            return path;
        };
        return build;
    }, [groups]);

    const selected = useMemo(() => ledgers.find((l) => l.id === value) || null, [ledgers, value]);

    // Filtered ledgers grouped by their full path, paths sorted alphabetically.
    const sections = useMemo(() => {
        const q = search.trim().toLowerCase();
        const excluded = new Set(excludeIds);
        const rows = ledgers
            .filter((l) => !excluded.has(l.id))
            .filter((l) => (filter ? filter(l) : true))
            .map((l) => ({ ledger: l, path: pathOf(l.account_group_id) || l.group_name || 'Ungrouped' }))
            .filter(({ ledger, path }) =>
                !q || ledger.name.toLowerCase().includes(q) || path.toLowerCase().includes(q));

        const byPath = new Map<string, typeof rows>();
        for (const row of rows) {
            if (!byPath.has(row.path)) byPath.set(row.path, []);
            byPath.get(row.path)!.push(row);
        }
        return [...byPath.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([path, items]) => ({
                path,
                items: items.sort((a, b) => a.ledger.name.localeCompare(b.ledger.name)),
            }));
    }, [ledgers, search, excludeIds, filter, pathOf]);

    const pick = (l: LedgerAccount) => {
        onChange({ id: l.id, name: l.name });
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
                    {selected
                        ? <>{selected.name}<span className="text-slate-500 text-xs"> · {pathOf(selected.account_group_id) || selected.group_name}</span></>
                        : placeholder}
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
                            placeholder="Search ledger or group…"
                            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                        />
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                        {isLoading && <p className="px-3 py-3 text-sm text-slate-500">Loading…</p>}
                        {!isLoading && sections.length === 0 && (
                            <p className="px-3 py-3 text-sm text-slate-500">No matching ledgers</p>
                        )}
                        {sections.map((section) => (
                            <div key={section.path}>
                                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    {section.path}
                                </p>
                                {section.items.map(({ ledger }) => (
                                    <button
                                        key={ledger.id}
                                        type="button"
                                        onClick={() => pick(ledger)}
                                        className={`w-full text-left pl-5 pr-3 py-1.5 text-sm hover:bg-slate-700/60 ${ledger.id === value ? 'text-purple-300' : 'text-slate-200'}`}
                                    >
                                        {ledger.name}
                                        {ledger.code && <span className="text-slate-500 text-xs"> · {ledger.code}</span>}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
