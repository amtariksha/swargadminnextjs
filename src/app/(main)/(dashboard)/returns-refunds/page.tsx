'use client';

import { useState } from 'react';
import {
    useReturns,
    useApproveReturn,
    useRefundMode,
    useSetRefundMode,
    PackagingReturn,
    ReturnStatus,
    RefundMode,
} from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { RotateCcw, ImageOff, Check } from 'lucide-react';
import { ApiError } from '@/lib/api-error';
import { toast } from 'sonner';

const inr = (n: number | null | undefined) =>
    '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_OPTIONS: { value: ReturnStatus | ''; label: string }[] = [
    { value: '', label: 'All statuses' },
    { value: 'requested', label: 'Requested' },
    { value: 'picked_up_last_mile', label: 'Picked up (last mile)' },
    { value: 'picked_up_truck', label: 'Picked up (truck)' },
    { value: 'pending_approval', label: 'Pending approval' },
    { value: 'refunded', label: 'Refunded' },
    { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE: Record<ReturnStatus, { label: string; cls: string }> = {
    requested: { label: 'Requested', cls: 'bg-slate-600/30 text-slate-300' },
    picked_up_last_mile: { label: 'Picked up (last mile)', cls: 'bg-blue-500/20 text-blue-400' },
    picked_up_truck: { label: 'Picked up (truck)', cls: 'bg-indigo-500/20 text-indigo-400' },
    pending_approval: { label: 'Pending approval', cls: 'bg-amber-500/20 text-amber-400' },
    refunded: { label: 'Refunded', cls: 'bg-green-500/20 text-green-400' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-500/20 text-red-400' },
};

function StatusBadge({ status }: { status: ReturnStatus }) {
    const meta = STATUS_BADGE[status] ?? { label: status, cls: 'bg-slate-600/30 text-slate-300' };
    return (
        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${meta.cls}`}>
            {meta.label}
        </span>
    );
}

export default function ReturnsRefundsPage() {
    const [statusFilter, setStatusFilter] = useState<ReturnStatus | ''>('');
    const { data: returnsData, isLoading } = useReturns(statusFilter || undefined);
    const { data: refundMode } = useRefundMode();
    const setRefundMode = useSetRefundMode();
    const approveReturn = useApproveReturn();
    const [approvingId, setApprovingId] = useState<number | null>(null);

    const rows = returnsData?.rows ?? [];

    const handleSetMode = async (mode: RefundMode) => {
        if (mode === refundMode) return;
        try {
            await setRefundMode.mutateAsync(mode);
            toast.success(`Refund mode set to ${mode}`);
        } catch (error) {
            toast.error(error instanceof ApiError ? error.userMessage : 'Failed to update refund mode');
        }
    };

    const handleApprove = async (item: PackagingReturn) => {
        if (!confirm(`Approve return #${item.id} and refund the customer?`)) return;
        setApprovingId(item.id);
        try {
            const result = await approveReturn.mutateAsync({ return_id: item.id });
            const data = result.data;
            toast.success(
                `Refunded ${inr(data?.refund_amount)} — new wallet balance ${inr(data?.new_wallet_balance)}`
            );
        } catch (error) {
            toast.error(error instanceof ApiError ? error.userMessage : 'Failed to approve return');
        } finally {
            setApprovingId(null);
        }
    };

    const columns: Column<PackagingReturn>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        {
            key: 'customer_name',
            header: 'Customer',
            render: (item) => (
                <div>
                    <p className="font-medium text-white">{item.customer_name || '-'}</p>
                    <p className="text-xs text-slate-400">{item.customer_phone || '-'}</p>
                </div>
            ),
        },
        {
            key: 'packaging_type_name',
            header: 'Packaging Type',
            render: (item) => <span className="text-white">{item.packaging_type_name || '-'}</span>,
        },
        {
            key: 'qty',
            header: 'Qty',
            width: '70px',
            render: (item) => <span className="text-white">{item.qty}</span>,
        },
        {
            key: 'status',
            header: 'Status',
            render: (item) => <StatusBadge status={item.status} />,
        },
        {
            key: 'refund_amount',
            header: 'Refund Amount',
            render: (item) => (
                <span className="text-white">
                    {item.refund_amount != null ? inr(item.refund_amount) : '-'}
                </span>
            ),
        },
        {
            key: 'pickup_photo_url',
            header: 'Pickup Photo',
            width: '110px',
            sortable: false,
            render: (item) =>
                item.pickup_photo_url ? (
                    <a
                        href={item.pickup_photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={item.pickup_photo_url}
                            alt={`Pickup photo for return ${item.id}`}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-700/50 hover:ring-2 hover:ring-purple-500/50"
                        />
                    </a>
                ) : (
                    <div
                        className="w-12 h-12 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-center"
                        title="No photo"
                    >
                        <ImageOff className="w-4 h-4 text-slate-500" />
                    </div>
                ),
        },
        {
            key: 'actions',
            header: 'Actions',
            width: '120px',
            sortable: false,
            render: (item) =>
                item.status === 'pending_approval' ? (
                    <button
                        onClick={() => handleApprove(item)}
                        disabled={approvingId === item.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-medium hover:bg-green-500/30 disabled:opacity-50"
                    >
                        <Check className="w-3.5 h-3.5" />
                        {approvingId === item.id ? 'Approving...' : 'Approve'}
                    </button>
                ) : (
                    <span className="text-slate-500 text-xs">-</span>
                ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Returns &amp; Refunds</h1>
                    <p className="text-slate-400">Track returnable packaging pickups and approve refunds</p>
                </div>
            </div>

            {/* Refund mode toggle */}
            <div className="glass rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                            <RotateCcw className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white mb-1">Refund Mode</h3>
                            <p className="text-sm text-slate-400">
                                Auto refunds the customer wallet as soon as a return is picked up.
                                Manual requires an admin to approve each refund.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {(['auto', 'manual'] as RefundMode[]).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => handleSetMode(mode)}
                                disabled={setRefundMode.isPending}
                                className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all disabled:opacity-50 ${
                                    refundMode === mode
                                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                                        : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:text-white'
                                }`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Status filter */}
            <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-slate-400">Filter by status</label>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as ReturnStatus | '')}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                    {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>

            <DataTable
                data={rows}
                columns={columns}
                loading={isLoading}
                searchPlaceholder="Search returns..."
                emptyMessage="No returns found"
            />
        </div>
    );
}
