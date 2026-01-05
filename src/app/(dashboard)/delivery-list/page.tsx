'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import { useDrivers } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Calendar, RefreshCw, Plus, Truck, Package, Edit, Check, Trash2, ListChecks } from 'lucide-react';

interface DeliveryItem {
    id: number;
    pre_delivery_id: number;
    order_id: number;
    user_id: number;
    product_id: number;
    name: string;
    s_phone: string;
    title: string;
    qty: number;
    qty_text: string;
    mark_delivered_qty: number | null;
    delivery_boy_id: number | null;
    delivery_boy_name: string | null;
    status: number;
    delivered_date: string | null;
    mark_delivered_time_stamp: string | null;
    flat_no: string | null;
    apartment_name: string | null;
    area: string | null;
    city: string | null;
    pincode: string;
    wallet_amount: number;
    start_date: string;
    subscription_type: number;
    order_type: number;
    user_holiday: number | null;
}

const getSubscriptionLabel = (type: number) => {
    const types: Record<number, string> = {
        1: 'One Time Order',
        2: 'Weekly',
        3: 'Daily',
        4: 'Alternative Days',
    };
    return types[type] || 'Normal Order';
};

const getOrderTypeLabel = (type: number) => {
    return type === 1 ? 'Prepaid' : type === 2 ? 'Postpaid' : 'N/A';
};

const getStatusLabel = (status: number) => {
    const map: Record<number, { label: string; color: string }> = {
        1: { label: 'Pending', color: 'text-slate-400' },
        2: { label: 'Not Delivered', color: 'text-red-400' },
        3: { label: 'Delivered', color: 'text-green-400' },
    };
    return map[status] || { label: 'N/A', color: 'text-slate-400' };
};

const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '-';
    try {
        return format(new Date(timestamp), 'hh:mm a');
    } catch {
        return '-';
    }
};

const composeAddress = (item: DeliveryItem) => {
    const parts = [
        item.flat_no ? `Flat No. - ${item.flat_no}` : null,
        item.apartment_name,
        item.area,
        item.city,
        item.pincode,
    ].filter(Boolean);
    return parts.join(', ') || '-';
};

export default function DeliveryListPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const today = format(new Date(), 'yyyy-MM-dd');
    const [selectedDate, setSelectedDate] = useState(today);
    const [selectedDriver, setSelectedDriver] = useState<number | ''>('');
    const [selectedRows, setSelectedRows] = useState<number[]>([]);
    const [editQtyModal, setEditQtyModal] = useState<{ item: DeliveryItem; newQty: number } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        delivered: false,
        not_delivered: false,
        delivered_diff_qty: false,
    });

    const { data: drivers = [] } = useDrivers();

    const { data: rawItems = [], isLoading, refetch } = useQuery({
        queryKey: ['delivery-list', selectedDate],
        queryFn: async () => {
            const response = await GET<DeliveryItem[]>(`/get_genrated_order_list/${selectedDate}`);
            return response.data || [];
        },
    });

    // Remove duplicates by pre_delivery_id
    const uniqueItems = useMemo(() => {
        const seen = new Set<number>();
        return rawItems.filter(item => {
            if (seen.has(item.pre_delivery_id)) return false;
            seen.add(item.pre_delivery_id);
            return true;
        });
    }, [rawItems]);

    // Apply filters
    const deliveryItems = useMemo(() => {
        let result = uniqueItems;

        if (selectedDriver) {
            result = result.filter(item => item.delivery_boy_id === selectedDriver);
        }
        if (filters.delivered) {
            result = result.filter(item => item.status === 3);
        }
        if (filters.not_delivered) {
            result = result.filter(item => item.status !== 3);
        }
        if (filters.delivered_diff_qty) {
            result = result.filter(item =>
                item.mark_delivered_qty !== null && item.qty !== item.mark_delivered_qty
            );
        }
        return result;
    }, [uniqueItems, selectedDriver, filters]);

    const handleGenerateList = async () => {
        if (!confirm(`Generate delivery list for ${selectedDate}?`)) return;
        setIsSubmitting(true);
        try {
            await POST('/genrate_order_list', { date: selectedDate });
            refetch();
        } catch (error) {
            console.error('Generate failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteList = async () => {
        if (!confirm(`Delete delivery list for ${selectedDate}? This cannot be undone.`)) return;
        setIsSubmitting(true);
        try {
            await POST('/delete_pre_delivery_list', { date: selectedDate });
            refetch();
        } catch (error) {
            console.error('Delete failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleMarkDelivered = async () => {
        if (selectedRows.length === 0) return;
        if (!confirm(`Mark ${selectedRows.length} items as delivered?`)) return;
        setIsSubmitting(true);
        try {
            await POST('/mark_delivery', { orders_id: selectedRows.join(', ') });
            setSelectedRows([]);
            refetch();
        } catch (error) {
            console.error('Mark delivered failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateQty = async () => {
        if (!editQtyModal) return;
        setIsSubmitting(true);
        try {
            await POST('/pre_delivery_update', {
                id: editQtyModal.item.pre_delivery_id,
                qty: editQtyModal.newQty
            });
            setEditQtyModal(null);
            refetch();
        } catch (error) {
            console.error('Update qty failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const columns: Column<DeliveryItem>[] = [
        {
            key: 'actions',
            header: 'Edit',
            width: '60px',
            render: (item) => (
                <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/orders/${item.id}`); }}
                    className="p-1.5 hover:bg-slate-800/50 rounded-lg"
                >
                    <Edit className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        {
            key: 'edit_qty',
            header: 'Qty',
            width: '50px',
            render: (item) => (
                <button
                    onClick={(e) => { e.stopPropagation(); setEditQtyModal({ item, newQty: item.qty }); }}
                    disabled={item.status === 3}
                    className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-30"
                >
                    <Edit className="w-3 h-3 text-blue-400" />
                </button>
            ),
        },
        { key: 'pre_delivery_id', header: 'Pre ID', width: '70px' },
        { key: 'id', header: 'Order', width: '70px' },
        {
            key: 'name',
            header: 'Customer',
            render: (item) => (
                <div>
                    <p className="font-medium text-white">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.s_phone}</p>
                </div>
            ),
        },
        { key: 'title', header: 'Product' },
        { key: 'qty_text', header: 'Qty Text', width: '100px' },
        {
            key: 'qty',
            header: 'Qty',
            width: '60px',
            render: (item) => (
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-sm font-medium">
                    {item.qty}
                </span>
            ),
        },
        {
            key: 'mark_delivered_qty',
            header: 'Del Qty',
            width: '70px',
            render: (item) => {
                const isDiff = item.mark_delivered_qty !== null && item.mark_delivered_qty !== item.qty;
                return (
                    <span className={`font-medium ${isDiff ? 'text-red-400' : 'text-slate-300'}`}>
                        {item.mark_delivered_qty ?? '-'}
                    </span>
                );
            },
        },
        {
            key: 'delivery_boy_name',
            header: 'Driver',
            render: (item) => (
                <div className="flex items-center gap-1.5">
                    <Truck className="w-3 h-3 text-slate-400" />
                    <span className="text-sm">{item.delivery_boy_name || 'Unassigned'}</span>
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (item) => {
                const status = getStatusLabel(item.status);
                return <span className={`font-semibold ${status.color}`}>{status.label}</span>;
            },
        },
        { key: 'delivered_date', header: 'Del Date', width: '100px' },
        {
            key: 'mark_delivered_time_stamp',
            header: 'Del Time',
            width: '90px',
            render: (item) => <span className="text-sm">{formatTime(item.mark_delivered_time_stamp)}</span>,
        },
        {
            key: 'address',
            header: 'Address',
            render: (item) => (
                <span className="text-sm text-slate-300 truncate max-w-[200px] block" title={composeAddress(item)}>
                    {composeAddress(item)}
                </span>
            ),
        },
        { key: 'pincode', header: 'Pincode', width: '80px' },
        {
            key: 'wallet_amount',
            header: 'Wallet',
            width: '80px',
            render: (item) => <span className="text-green-400">₹{item.wallet_amount || 0}</span>,
        },
        { key: 'start_date', header: 'Start', width: '100px' },
        {
            key: 'subscription_type',
            header: 'Sub Type',
            width: '120px',
            render: (item) => <span className="text-xs">{getSubscriptionLabel(item.subscription_type)}</span>,
        },
    ];

    // Stats
    const stats = {
        total: deliveryItems.length,
        pending: deliveryItems.filter(d => d.status === 1).length,
        notDelivered: deliveryItems.filter(d => d.status === 2).length,
        delivered: deliveryItems.filter(d => d.status === 3).length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Delivery List</h1>
                    <p className="text-slate-400">Manage daily deliveries</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                        />
                    </div>
                    <select
                        value={selectedDriver}
                        onChange={(e) => setSelectedDriver(e.target.value ? Number(e.target.value) : '')}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                    >
                        <option value="">All Drivers</option>
                        {drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                    <button onClick={() => refetch()} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl">
                        <RefreshCw className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
                <button
                    onClick={handleGenerateList}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium disabled:opacity-50"
                >
                    <Plus className="w-4 h-4" /> Generate List
                </button>
                <button
                    onClick={handleDeleteList}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-medium disabled:opacity-50"
                >
                    <Trash2 className="w-4 h-4" /> Delete List
                </button>
                {selectedRows.length > 0 && (
                    <button
                        onClick={handleMarkDelivered}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                    >
                        <Check className="w-4 h-4" /> Mark {selectedRows.length} Delivered
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                        type="checkbox"
                        checked={filters.delivered}
                        onChange={(e) => setFilters({ ...filters, delivered: e.target.checked, not_delivered: false })}
                        className="rounded border-slate-600"
                    />
                    Delivered Only
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                        type="checkbox"
                        checked={filters.not_delivered}
                        onChange={(e) => setFilters({ ...filters, not_delivered: e.target.checked, delivered: false })}
                        className="rounded border-slate-600"
                    />
                    Not Delivered Only
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                        type="checkbox"
                        checked={filters.delivered_diff_qty}
                        onChange={(e) => setFilters({ ...filters, delivered_diff_qty: e.target.checked })}
                        className="rounded border-slate-600"
                    />
                    Different Qty Delivered
                </label>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total</p>
                    <p className="text-2xl font-bold text-white">{stats.total}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Pending</p>
                    <p className="text-2xl font-bold text-slate-300">{stats.pending}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Not Delivered</p>
                    <p className="text-2xl font-bold text-red-400">{stats.notDelivered}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Delivered</p>
                    <p className="text-2xl font-bold text-green-400">{stats.delivered}</p>
                </div>
            </div>

            {/* Data Table */}
            <DataTable
                data={deliveryItems}
                columns={columns}
                loading={isLoading}
                pageSize={50}
                searchPlaceholder="Search deliveries..."
                emptyMessage="No deliveries found for this date"
                onRowClick={(item) => router.push(`/orders/${item.id}`)}
            />

            {/* Edit Qty Modal */}
            {editQtyModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-sm mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Edit Quantity</h2>
                        <p className="text-sm text-slate-400 mb-4">
                            {editQtyModal.item.name} - {editQtyModal.item.title}
                        </p>
                        <div className="mb-4">
                            <label className="block text-sm text-slate-400 mb-1">New Quantity</label>
                            <input
                                type="number"
                                value={editQtyModal.newQty}
                                onChange={(e) => setEditQtyModal({ ...editQtyModal, newQty: Number(e.target.value) })}
                                min={0}
                                className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setEditQtyModal(null)}
                                className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateQty}
                                disabled={isSubmitting}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                            >
                                {isSubmitting ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
