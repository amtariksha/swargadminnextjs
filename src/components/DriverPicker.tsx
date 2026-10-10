'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useDrivers } from '@/hooks/useData';
import { Search, ChevronDown, X, Check } from 'lucide-react';

interface DriverPickerProps {
    value: number | '';
    onChange: (driverUserId: number | '') => void;
    disabled?: boolean;
    /** Optional label override; defaults to "Driver". */
    label?: string;
}

/**
 * Single-select searchable driver dropdown. Wraps `useDrivers()` (which returns
 * every active driver across last-mile / truck / day roles, each tagged
 * with role_label).
 *
 * Features:
 * 1. Uses actual user_id for assignment and broadcast resolution.
 * 2. Alphabetically sorted in ascending order.
 * 3. Searchable filter input by driver name, phone, or route label.
 */
export default function DriverPicker({
    value,
    onChange,
    disabled = false,
    label = 'Driver',
}: DriverPickerProps) {
    const { data: drivers = [], isLoading } = useDrivers();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    // Drivers sorted in ascending alphabetical order by name
    const sortedDrivers = useMemo(() => {
        return [...drivers].sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );
    }, [drivers]);

    // Filtered by search term
    const filteredDrivers = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return sortedDrivers;
        return sortedDrivers.filter((d) => {
            const nameMatch = d.name?.toLowerCase().includes(query);
            const phoneMatch = d.phone?.toLowerCase().includes(query);
            const roleMatch = d.role_label?.toLowerCase().includes(query);
            return nameMatch || phoneMatch || roleMatch;
        });
    }, [sortedDrivers, search]);

    // Currently selected driver object
    const selectedDriver = useMemo(() => {
        if (value === '') return null;
        return drivers.find((d) => (d.user_id ?? d.id) === value) || null;
    }, [drivers, value]);

    const handleSelect = (driverUserId: number) => {
        onChange(driverUserId);
        setIsOpen(false);
        setSearch('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setSearch('');
    };

    return (
        <div ref={containerRef} className="relative">
            <label className="block text-sm font-medium text-slate-300 mb-2">
                {label}
            </label>

            {/* Trigger Button */}
            <button
                type="button"
                disabled={disabled || isLoading}
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-left text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50 transition-colors hover:bg-slate-800/80"
            >
                <div className="truncate pr-2">
                    {isLoading ? (
                        <span className="text-slate-400">Loading drivers…</span>
                    ) : selectedDriver ? (
                        <span>
                            <span className="font-medium text-white">{selectedDriver.name}</span>
                            {selectedDriver.role_label && (
                                <span className="text-xs text-purple-400 ml-2 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                                    {selectedDriver.role_label}
                                </span>
                            )}
                            {selectedDriver.phone && (
                                <span className="text-xs text-slate-400 ml-2">
                                    · {selectedDriver.phone}
                                </span>
                            )}
                        </span>
                    ) : (
                        <span className="text-slate-400">Select a driver</span>
                    )}
                </div>

                <div className="flex items-center gap-1 shrink-0 text-slate-400">
                    {selectedDriver && !disabled && (
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={handleClear}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleClear(e as unknown as React.MouseEvent);
                                }
                            }}
                            className="p-1 hover:text-white hover:bg-slate-700/50 rounded-md transition-colors"
                            title="Clear selection"
                        >
                            <X className="w-3.5 h-3.5" />
                        </span>
                    )}
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden backdrop-blur-md">
                    {/* Live Search Input */}
                    <div className="p-2 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search driver by name, phone or route…"
                                className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700/60 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Options List */}
                    <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/40">
                        {filteredDrivers.length === 0 ? (
                            <div className="px-4 py-6 text-center text-sm text-slate-400">
                                No drivers found matching &quot;{search}&quot;
                            </div>
                        ) : (
                            filteredDrivers.map((d) => {
                                const driverUserId = d.user_id ?? d.id;
                                const isSelected = value === driverUserId;
                                return (
                                    <button
                                        key={`${d.id}-${driverUserId}`}
                                        type="button"
                                        onClick={() => handleSelect(driverUserId)}
                                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left text-sm transition-colors ${
                                            isSelected
                                                ? 'bg-purple-600/20 text-purple-200'
                                                : 'text-slate-200 hover:bg-slate-800/70 hover:text-white'
                                        }`}
                                    >
                                        <div className="truncate">
                                            <div className="font-medium flex items-center gap-2">
                                                <span>{d.name || `Driver #${driverUserId}`}</span>
                                                {d.role_label && (
                                                    <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-purple-300 border border-purple-500/30">
                                                        {d.role_label}
                                                    </span>
                                                )}
                                            </div>
                                            {d.phone && (
                                                <div className="text-xs text-slate-400 mt-0.5">
                                                    {d.phone}
                                                </div>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <Check className="w-4 h-4 text-purple-400 shrink-0 ml-2" />
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
