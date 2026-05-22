'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable, { Column } from '@/components/DataTable';
import { selectClassName, inputClassName } from '@/components/FormField';
import { useFeedbackList, type CustomerFeedback, type FeedbackListFilters } from '@/hooks/useData';
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
            <div>
                <h1 className="text-2xl font-bold text-white">All feedback</h1>
                <p className="text-slate-400 text-sm">Every logged relationship and reactivation call.</p>
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
        </div>
    );
}
