'use client';

import { useRouter } from 'next/navigation';
import { Phone, RefreshCw } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import ActivityWindowStrip from '@/components/crm/ActivityWindowStrip';
import { useFeedbackWorklist, type WorklistItem } from '@/hooks/useData';
import { formatApiDate } from '@/lib/dateUtils';

function fmtDate(value: string | null | undefined): string {
    if (!value) return '-';
    try {
        return formatApiDate(String(value), 'dd MMM yyyy');
    } catch {
        return String(value).slice(0, 10);
    }
}

export default function WorklistPage() {
    const router = useRouter();
    const { data, isLoading, refetch, isFetching } = useFeedbackWorklist();
    const items = data?.items ?? [];

    const openCall = (item: WorklistItem) => {
        router.push(`/crm/call/${item.user_id}?from=worklist`);
    };

    const columns: Column<WorklistItem>[] = [
        {
            key: 'reason', header: 'Reason', width: '150px',
            render: (item) =>
                item.reason === 'followup_due' ? (
                    <span className="px-2 py-1 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-400">
                        Follow-up {fmtDate(item.followup_date)}
                    </span>
                ) : (
                    <span className="px-2 py-1 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400">
                        Due for call
                    </span>
                ),
        },
        { key: 'customer_name', header: 'Customer', render: (item) => <span className="text-white font-medium">{item.customer_name}</span> },
        { key: 'phone', header: 'Phone', width: '130px' },
        { key: 'route', header: 'Route', width: '150px', render: (item) => item.route || '-' },
        {
            key: 'activity_windows', header: 'Activity', sortable: false, width: '230px',
            render: (item) => <ActivityWindowStrip windows={item.activity_windows} compact />,
        },
        { key: 'last_call_date', header: 'Last Call', width: '120px', render: (item) => fmtDate(item.last_call_date) },
        {
            key: 'wallet_amount', header: 'Wallet', width: '90px',
            render: (item) => (
                <span className={Number(item.wallet_amount) < 250 ? 'text-red-400' : 'text-slate-300'}>
                    ₹{item.wallet_amount ?? 0}
                </span>
            ),
        },
        {
            key: 'action', header: '', sortable: false, width: '120px',
            render: (item) => (
                <button
                    onClick={(e) => { e.stopPropagation(); openCall(item); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 text-purple-300 rounded-lg text-xs font-medium hover:bg-purple-600/30"
                >
                    <Phone className="w-3.5 h-3.5" /> Start call
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Customers due for a call</h1>
                    <p className="text-slate-400 text-sm">
                        {data
                            ? `${data.count} customer${data.count === 1 ? '' : 's'} · no completed call in the last ${data.cadence_days} days, plus follow-ups due today`
                            : 'Loading the relationship-call worklist…'}
                    </p>
                </div>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </div>

            <DataTable
                data={items}
                columns={columns}
                loading={isLoading}
                pageSize={25}
                searchPlaceholder="Search customers…"
                emptyMessage="No customers are due for a call right now."
                onRowClick={openCall}
            />
        </div>
    );
}
