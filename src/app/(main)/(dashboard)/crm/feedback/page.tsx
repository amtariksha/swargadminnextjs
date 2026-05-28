'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import { selectClassName, inputClassName } from '@/components/FormField';
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import { useFeedbackList, useUsers, type CustomerFeedback, type FeedbackListFilters } from '@/hooks/useData';
import {
    FEEDBACK_STATUS_OPTIONS, CALL_TYPE_OPTIONS, STATUS_BADGE_CLASS, statusLabel, callTypeLabel,
} from '@/lib/crm';
import { formatApiDate } from '@/lib/dateUtils';

function fmtDate(value: string | null | undefined): string {
    if (!value) return '-';
    try {
        return formatApiDate(String(value), 'dd MMM yyyy');
    } catch {
        return String(value).slice(0, 10);
    }
}

/** Hard-truncate a string to N chars with an ellipsis suffix. */
function truncate(value: string | null | undefined, max: number): string {
    if (!value) return '-';
    const s = String(value);
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Long-text field shown inside the expanded panel. */
function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
    if (!value) return null;
    return (
        <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">{label}</div>
            <div className="text-sm text-slate-200 whitespace-pre-wrap">{value}</div>
        </div>
    );
}

export default function AllFeedbackPage() {
    const router = useRouter();
    const [filters, setFilters] = useState<FeedbackListFilters>({});
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const { data: feedback = [], isLoading } = useFeedbackList(filters);

    // "New feedback" — pick a customer, then route into the guided call
    // screen. Reuses useUsers + a small inline search rather than the
    // CustomerPicker component (which has a "create new customer" path we
    // don't want here — feedback only ever attaches to an existing user).
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerType, setPickerType] = useState<'feedback' | 'reactivation'>('feedback');
    const [pickerSearch, setPickerSearch] = useState('');
    const { data: users = [], isLoading: usersLoading } = useUsers();
    const pickerMatches = useMemo(() => {
        const q = pickerSearch.trim().toLowerCase();
        const customers = users.filter((u) => {
            const r = (u as unknown as { role?: unknown[] }).role;
            return !r || (Array.isArray(r) && r.length === 0);
        });
        if (!q) return customers.slice(0, 25);
        return customers
            .filter((u) =>
                (u.name && u.name.toLowerCase().includes(q)) ||
                (u.phone && u.phone.includes(q)),
            )
            .slice(0, 50);
    }, [users, pickerSearch]);
    const openPicker = (callType: 'feedback' | 'reactivation') => {
        setPickerType(callType);
        setPickerSearch('');
        setPickerOpen(true);
    };
    const handlePickCustomer = (userId: number) => {
        setPickerOpen(false);
        router.push(`/crm/call/${userId}?type=${pickerType}`);
    };

    const setFilter = (key: keyof FeedbackListFilters, value: string) =>
        setFilters((prev) => ({ ...prev, [key]: value || undefined }));

    const toggleRow = (id: number) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });

    /** Client-side search across customer + caller + any free-text fields. */
    const visibleRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return feedback;
        return feedback.filter((f) => {
            const haystack = [
                f.customer_name, f.customer_phone, f.caller_name, f.status,
                f.problems, f.product_feedback, f.delivery_feedback,
                f.application_feedback, f.customer_care_notes, f.occupation,
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [feedback, search]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">All feedback</h1>
                    <p className="text-slate-400 text-sm">Every logged relationship and reactivation call.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => openPicker('feedback')}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
                    >
                        <Plus className="w-4 h-4" />
                        New feedback
                    </button>
                    <button
                        onClick={() => openPicker('reactivation')}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-200 rounded-xl text-sm hover:bg-slate-800"
                    >
                        <Plus className="w-4 h-4" />
                        New reactivation
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="glass rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Status</label>
                    <select value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)} className={selectClassName}>
                        <option value="">All statuses</option>
                        {FEEDBACK_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Call type</label>
                    <select value={filters.call_type ?? ''} onChange={(e) => setFilter('call_type', e.target.value)} className={selectClassName}>
                        <option value="">All types</option>
                        {CALL_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">From date</label>
                    <input type="date" value={filters.from_date ?? ''} onChange={(e) => setFilter('from_date', e.target.value)} className={inputClassName} />
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">To date</label>
                    <input type="date" value={filters.to_date ?? ''} onChange={(e) => setFilter('to_date', e.target.value)} className={inputClassName} />
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search feedback…"
                    className={`${inputClassName} pl-9`}
                />
            </div>

            {/* Table */}
            <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900/60 text-slate-400 uppercase text-xs tracking-wide">
                            <tr>
                                <th className="px-3 py-2 w-8" />
                                <th className="px-3 py-2 text-left">Call date</th>
                                <th className="px-3 py-2 text-left">Customer</th>
                                <th className="px-3 py-2 text-left">Phone</th>
                                <th className="px-3 py-2 text-left">Type</th>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-left">Follow-up</th>
                                <th className="px-3 py-2 text-left">Caller</th>
                                <th className="px-3 py-2 text-left">Occupation</th>
                                <th className="px-3 py-2 text-left">Pref. call time</th>
                                <th className="px-3 py-2 text-left">Pref. delivery time</th>
                                <th className="px-3 py-2 text-left">Ring bell</th>
                                <th className="px-3 py-2 text-left">Drop place</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={13} className="px-3 py-8 text-center text-slate-400">
                                        Loading feedback…
                                    </td>
                                </tr>
                            ) : visibleRows.length === 0 ? (
                                <tr>
                                    <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                                        No feedback entries match these filters.
                                    </td>
                                </tr>
                            ) : (
                                visibleRows.map((f) => {
                                    const isOpen = expanded.has(f.id);
                                    const longTextPresent =
                                        f.problems || f.product_feedback || f.delivery_feedback ||
                                        f.application_feedback || f.customer_care_notes;
                                    return (
                                        <Fragment key={f.id}>
                                            <tr
                                                onClick={() => router.push(`/crm/call/${f.user_id}?feedbackId=${f.id}&type=${f.call_type}`)}
                                                className="hover:bg-slate-800/30 cursor-pointer"
                                            >
                                                <td className="px-3 py-2.5">
                                                    {longTextPresent ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleRow(f.id); }}
                                                            className="p-1 hover:bg-slate-700/50 rounded text-slate-400"
                                                            aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                                                        >
                                                            {isOpen
                                                                ? <ChevronDown className="w-4 h-4" />
                                                                : <ChevronRight className="w-4 h-4" />}
                                                        </button>
                                                    ) : (
                                                        <span className="block w-6" />
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                                    {fmtDate(f.calling_date)}
                                                </td>
                                                <td className="px-3 py-2.5 text-white font-medium" title={f.customer_name ?? `#${f.user_id}`}>
                                                    {truncate(f.customer_name || `#${f.user_id}`, 20)}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                                    {f.customer_phone || '-'}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                                    {callTypeLabel(f.call_type)}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    {f.status ? (
                                                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${STATUS_BADGE_CLASS[f.status] || 'bg-slate-700/40 text-slate-400'}`}>
                                                            {statusLabel(f.status)}
                                                        </span>
                                                    ) : <span className="text-slate-600">-</span>}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                                    {fmtDate(f.followup_date)}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300" title={f.caller_name ?? ''}>
                                                    {truncate(f.caller_name, 18)}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300" title={f.occupation ?? ''}>
                                                    {truncate(f.occupation, 18)}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300" title={f.preferred_call_time ?? ''}>
                                                    {truncate(f.preferred_call_time, 18)}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300" title={f.preferred_delivery_time ?? ''}>
                                                    {truncate(f.preferred_delivery_time, 18)}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                                    {f.ring_bell_pref || '-'}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                                    {f.drop_place_pref || '-'}
                                                </td>
                                            </tr>
                                            {isOpen && (
                                                <tr className="bg-slate-900/40">
                                                    <td colSpan={13} className="px-6 py-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <DetailField label="Problems / issues" value={f.problems} />
                                                            <DetailField label="Product feedback" value={f.product_feedback} />
                                                            <DetailField label="Delivery feedback" value={f.delivery_feedback} />
                                                            <DetailField label="App feedback" value={f.application_feedback} />
                                                            <DetailField label="Customer care notes" value={f.customer_care_notes} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 border-t border-slate-800/40 text-xs text-slate-500">
                    {visibleRows.length} feedback {visibleRows.length === 1 ? 'entry' : 'entries'}
                </div>
            </div>

            {/* New-feedback customer picker */}
            <Modal
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                title={pickerType === 'feedback' ? 'New feedback — pick customer' : 'New reactivation — pick customer'}
                size="md"
            >
                <div className="space-y-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            autoFocus
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            placeholder="Search by name or phone"
                            className={`${inputClassName} pl-9`}
                        />
                    </div>
                    <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-800/50 divide-y divide-slate-800/50">
                        {usersLoading ? (
                            <p className="px-3 py-4 text-sm text-slate-400">Loading customers…</p>
                        ) : pickerMatches.length === 0 ? (
                            <p className="px-3 py-4 text-sm text-slate-500">No matching customers.</p>
                        ) : (
                            pickerMatches.map((u) => (
                                <button
                                    key={u.id}
                                    onClick={() => handlePickCustomer(u.id)}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-800/50 transition-colors"
                                >
                                    <div className="text-white text-sm font-medium">{u.name || `#${u.id}`}</div>
                                    <div className="text-slate-500 text-xs">{u.phone || '-'}</div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
