'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { selectClassName, inputClassName } from '@/components/FormField';
import { Plus, Search } from 'lucide-react';
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

export default function AllFeedbackPage() {
    const router = useRouter();
    const [filters, setFilters] = useState<FeedbackListFilters>({});
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

    const columns: Column<CustomerFeedback>[] = [
        { key: 'calling_date', header: 'Call Date', width: '120px', render: (f) => fmtDate(f.calling_date) },
        { key: 'customer_name', header: 'Customer', render: (f) => <span className="text-white font-medium">{f.customer_name || `#${f.user_id}`}</span> },
        { key: 'customer_phone', header: 'Phone', width: '130px', render: (f) => f.customer_phone || '-' },
        { key: 'call_type', header: 'Type', width: '120px', render: (f) => callTypeLabel(f.call_type) },
        {
            key: 'status', header: 'Status', width: '130px',
            render: (f) =>
                f.status ? (
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_BADGE_CLASS[f.status] || 'bg-slate-700/40 text-slate-400'}`}>
                        {statusLabel(f.status)}
                    </span>
                ) : <span className="text-slate-600">-</span>,
        },
        { key: 'caller_name', header: 'Caller', width: '140px', render: (f) => f.caller_name || '-' },
        {
            key: 'problems', header: 'Notes', sortable: false,
            render: (f) => {
                const note = f.problems || f.product_feedback || f.delivery_feedback || f.customer_care_notes || '';
                return <span className="text-sm text-slate-400 line-clamp-2">{note || '-'}</span>;
            },
        },
    ];

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

            <DataTable
                data={feedback}
                columns={columns}
                loading={isLoading}
                pageSize={25}
                searchPlaceholder="Search feedback…"
                emptyMessage="No feedback entries match these filters."
                onRowClick={(f) => router.push(`/crm/call/${f.user_id}?feedbackId=${f.id}&type=${f.call_type}`)}
            />

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
