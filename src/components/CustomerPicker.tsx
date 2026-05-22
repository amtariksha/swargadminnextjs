'use client';

/**
 * CustomerPicker — Feature 10 (day-time ordering).
 *
 * A searchable customer combobox for the day-time order form. Either picks
 * an existing customer (fed by GET /get_user) or captures a brand-new
 * customer's name + phone — the backend creates the `users` row and tags it
 * channel_tag='day'.
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { useUsers } from '@/hooks/useData';
import { Search, UserPlus, X, ChevronDown } from 'lucide-react';
import { inputClassName } from '@/components/FormField';

export interface CustomerValue {
    userId: number | null;
    name: string;
    phone: string;
    isNew: boolean;
}

interface CustomerPickerProps {
    value: CustomerValue | null;
    onChange: (value: CustomerValue | null) => void;
    disabled?: boolean;
}

export default function CustomerPicker({ value, onChange, disabled }: CustomerPickerProps) {
    const { data: users = [], isLoading } = useUsers();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return users.slice(0, 50);
        return users
            .filter((u) => u.name?.toLowerCase().includes(q) || u.phone?.includes(q))
            .slice(0, 50);
    }, [users, search]);

    const pickExisting = (id: number, name: string, phone: string) => {
        onChange({ userId: id, name, phone, isNew: false });
        setOpen(false);
        setCreating(false);
    };

    const confirmNew = () => {
        const name = newName.trim();
        const phone = newPhone.trim();
        if (!name || !phone) return;
        onChange({ userId: null, name, phone, isNew: true });
        setOpen(false);
        setCreating(false);
        setNewName('');
        setNewPhone('');
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
                className={`${inputClassName} flex items-center justify-between text-left disabled:opacity-60`}
            >
                <span className={value ? 'text-white' : 'text-slate-500'}>
                    {value
                        ? `${value.name} · ${value.phone}${value.isNew ? ' (new)' : ''}`
                        : 'Select customer'}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 left-0 right-0 bg-slate-800 border border-slate-700 rounded-xl shadow-xl">
                    {!creating ? (
                        <>
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
                                <Search className="w-4 h-4 text-slate-400" />
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by name or phone…"
                                    className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                                />
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                {isLoading && <p className="px-3 py-3 text-sm text-slate-500">Loading…</p>}
                                {!isLoading && filtered.length === 0 && (
                                    <p className="px-3 py-3 text-sm text-slate-500">No matching customers</p>
                                )}
                                {filtered.map((u) => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => pickExisting(u.id, u.name, u.phone)}
                                        className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/60"
                                    >
                                        {u.name} <span className="text-slate-500">· {u.phone}</span>
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => setCreating(true)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-purple-400 border-t border-slate-700 hover:bg-slate-700/60"
                            >
                                <UserPlus className="w-4 h-4" /> Create new customer
                            </button>
                        </>
                    ) : (
                        <div className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-white">New customer</span>
                                <button type="button" onClick={() => setCreating(false)} className="text-slate-400 hover:text-white">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Full name"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500"
                            />
                            <input
                                value={newPhone}
                                onChange={(e) => setNewPhone(e.target.value)}
                                placeholder="Phone (10 digits)"
                                inputMode="numeric"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500"
                            />
                            <button
                                type="button"
                                onClick={confirmNew}
                                disabled={!newName.trim() || !newPhone.trim()}
                                className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm rounded-lg disabled:opacity-50"
                            >
                                Use this customer
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
