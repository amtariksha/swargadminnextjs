'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import { useDrivers } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Calendar, RefreshCw, Plus, Truck, Edit, Check, Trash2, Download, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

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
    order_assign_user: number | null;
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
}

const getSubscriptionLabel = (type: number) => {
    const types: Record<number, string> = { 1: 'One Time Order', 2: 'Weekly', 3: 'Daily', 4: 'Alternative Days' };
    return types[type] || 'Normal Order';
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
    } catch { return '-'; }
};

const composeAddress = (item: DeliveryItem) => {
    return [item.flat_no, item.apartment_name, item.area, item.city, item.pincode].filter(Boolean).join(', ') || '-';
};

// Passcode Dialog Component
function PasscodeDialog({ title, selectedDate, onConfirm, onCancel }: {
    title: string;
    selectedDate: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const [passcode, setPasscode] = useState('');
    const [error, setError] = useState('');

    const today = format(new Date(), 'yyyy-MM-dd');
    const expectedPasscode = selectedDate.replace(/-/g, ''); // YYYYMMDD
    const isToday = selectedDate === today;

    const handleSubmit = () => {
        // For today's date, passcode must be "TODAY" (case-insensitive)
        // For other dates, passcode must be YYYYMMDD of the selected date
        if (isToday) {
            if (passcode.toUpperCase() === 'TODAY') {
                onConfirm();
                return;
            }
            setError('Enter "TODAY" to confirm for current date');
            return;
        }

        if (passcode === expectedPasscode) {
            onConfirm();
            return;
        }
        setError(`Enter the date in YYYYMMDD format (${expectedPasscode}) to confirm`);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                </div>
                <p className="text-sm text-slate-400 mb-2">
                    Date: <span className="text-white font-medium">{selectedDate}</span>
                </p>
                <p className="text-sm text-slate-400 mb-4">
                    {isToday
                        ? 'Type "TODAY" to confirm action for the current date.'
                        : `Type the date in YYYYMMDD format (${expectedPasscode}) to confirm.`
                    }
                </p>
                <input
                    type="text"
                    value={passcode}
                    onChange={(e) => { setPasscode(e.target.value); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder={isToday ? 'Type TODAY' : `Type ${expectedPasscode}`}
                    autoFocus
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <div className="flex gap-3 mt-4">
                    <button onClick={onCancel}
                        className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl">
                        Cancel
                    </button>
                    <button onClick={handleSubmit}
                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function DeliveryListPage() {
    const router = useRouter();
    const today = format(new Date(), 'yyyy-MM-dd');
    const [selectedDate, setSelectedDate] = useState(today);
    const [selectedDriver, setSelectedDriver] = useState<number | ''>('');
    const [editQtyModal, setEditQtyModal] = useState<{ item: DeliveryItem; newQty: number } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [generateDialog, setGenerateDialog] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        delivered: false,
        not_delivered: false,
        delivered_diff_qty: false,
    });

    const { data: drivers = [] } = useDrivers();

    const { data: rawItems = [], isLoading, isFetching, refetch } = useQuery({
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
            result = result.filter(item =>
                item.order_assign_user === selectedDriver || item.delivery_boy_id === selectedDriver
            );
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
        setIsSubmitting(true);
        try {
            await POST('/genrate_order_list', { date: selectedDate });
            toast.success('Delivery list generated successfully');
            refetch();
        } catch (error) {
            console.error('Generate failed:', error);
            toast.error('Failed to generate delivery list');
        } finally {
            setIsSubmitting(false);
            setGenerateDialog(false);
        }
    };

    const handleDeleteList = async () => {
        setIsSubmitting(true);
        try {
            await POST('/delete_pre_delivery_list', { date: selectedDate });
            toast.success('Delivery list deleted');
            refetch();
        } catch (error) {
            console.error('Delete failed:', error);
            toast.error('Failed to delete delivery list');
        } finally {
            setIsSubmitting(false);
            setDeleteDialog(false);
        }
    };

    const handleMarkDelivered = async (preDeliveryIds: number[]) => {
        if (preDeliveryIds.length === 0) return;
        setIsSubmitting(true);
        try {
            await POST('/mark_delivery', { orders_id: preDeliveryIds.join(', ') });
            toast.success(`${preDeliveryIds.length} items marked as delivered`);
            refetch();
        } catch (error) {
            console.error('Mark delivered failed:', error);
            toast.error('Failed to mark as delivered');
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
            toast.success('Quantity updated');
            setEditQtyModal(null);
            refetch();
        } catch (error) {
            console.error('Update qty failed:', error);
            toast.error('Failed to update quantity');
        } finally {
            setIsSubmitting(false);
        }
    };

    // CSV Export
    const handleExport = useCallback(() => {
        const headers = ['Pre ID', 'Order ID', 'Name', 'Phone', 'Product', 'Qty Text', 'Qty', 'Del Qty', 'Driver', 'Status', 'Del Date', 'Del Time', 'Address', 'Pincode', 'Wallet', 'Start Date', 'Sub Type'];
        const rows = deliveryItems.map(item => [
            item.pre_delivery_id, item.id, item.name, item.s_phone, item.title,
            item.qty_text, item.qty, item.mark_delivered_qty ?? '',
            item.delivery_boy_name || '', getStatusLabel(item.status).label,
            item.delivered_date || '', formatTime(item.mark_delivered_time_stamp),
            composeAddress(item), item.pincode, item.wallet_amount,
            item.start_date, getSubscriptionLabel(item.subscription_type)
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedDate.replace(/-/g, '')}_Pre-delivery-list.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [deliveryItems, selectedDate]);

    const columns: Column<DeliveryItem>[] = [
        {
            key: 'actions', header: 'Edit', width: '60px',
            render: (item) => (
                <button onClick={(e) => { e.stopPropagation(); router.push(`/orders/${item.id}`); }}
                    className="p-1.5 hover:bg-slate-800/50 rounded-lg">
                    <Edit className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        {
            key: 'edit_qty', header: '', width: '40px',
            render: (item) => (
                <button
                    onClick={(e) => { e.stopPropagation(); setEditQtyModal({ item, newQty: item.qty }); }}
                    disabled={item.status === 3}
                    className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-30"
                    title="Edit quantity">
                    <Edit className="w-3 h-3 text-blue-400" />
                </button>
            ),
        },
        { key: 'pre_delivery_id', header: 'Pre ID', width: '80px' },
        { key: 'id', header: 'Order ID', width: '80px' },
        { key: 'name', header: 'Name', width: '150px' },
        { key: 's_phone', header: 'Phone', width: '120px' },
        { key: 'title', header: 'Product', width: '200px' },
        { key: 'qty_text', header: 'Qty Text', width: '120px' },
        {
            key: 'qty', header: 'Qty', width: '70px',
            render: (item) => <span className="font-semibold">{item.qty}</span>,
        },
        {
            key: 'mark_delivered_qty', header: 'Del Qty', width: '80px',
            render: (item) => {
                const isDiff = item.mark_delivered_qty !== null && item.mark_delivered_qty !== item.qty;
                return <span className={`font-medium ${isDiff ? 'text-red-400' : ''}`}>{item.mark_delivered_qty ?? '-'}</span>;
            },
        },
        { key: 'delivery_boy_name', header: 'Driver', width: '150px',
            render: (item) => <span>{item.delivery_boy_name || 'Unassigned'}</span>,
        },
        {
            key: 'status', header: 'Status', width: '120px',
            render: (item) => {
                const s = getStatusLabel(item.status);
                return <span className={`font-semibold ${s.color}`}>{s.label}</span>;
            },
        },
        { key: 'delivered_date', header: 'Del Date', width: '110px' },
        {
            key: 'mark_delivered_time_stamp', header: 'Del Time', width: '100px',
            render: (item) => <span className="text-sm">{formatTime(item.mark_delivered_time_stamp)}</span>,
        },
        {
            key: 'address', header: 'Address', width: '220px',
            render: (item) => <span className="text-sm text-slate-300 truncate max-w-[200px] block" title={composeAddress(item)}>{composeAddress(item)}</span>,
        },
        { key: 'pincode', header: 'Pincode', width: '100px' },
        {
            key: 'wallet_amount', header: 'Wallet', width: '100px',
            render: (item) => <span className="text-green-400">₹{item.wallet_amount || 0}</span>,
        },
        { key: 'start_date', header: 'Start Date', width: '110px' },
        {
            key: 'subscription_type', header: 'Sub Type', width: '130px',
            render: (item) => <span className="text-xs">{getSubscriptionLabel(item.subscription_type)}</span>,
        },
    ];

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
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="pl-10 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                        />
                    </div>
                    <select
                        value={selectedDriver}
                        onChange={(e) => setSelectedDriver(e.target.value ? Number(e.target.value) : '')}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white">
                        <option value="">All Drivers</option>
                        {[...drivers].sort((a, b) => a.name.localeCompare(b.name)).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                    <button onClick={() => refetch()} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:bg-slate-700/50">
                        <RefreshCw className={`w-5 h-5 text-slate-400 ${isFetching ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
                <button onClick={() => setGenerateDialog(true)} disabled={isSubmitting}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium disabled:opacity-50">
                    <Plus className="w-4 h-4" /> Generate List
                </button>
                <button onClick={() => setDeleteDialog(true)} disabled={isSubmitting}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-medium disabled:opacity-50">
                    <Trash2 className="w-4 h-4" /> Delete List
                </button>
                <button onClick={handleExport} disabled={deliveryItems.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white disabled:opacity-40">
                    <Download className="w-4 h-4" /> Export CSV
                </button>
                {deliveryItems.filter(d => d.status === 1).length > 0 && (
                    <button
                        onClick={() => {
                            const pendingIds = deliveryItems.filter(d => d.status === 1).map(d => d.pre_delivery_id);
                            if (confirm(`Mark all ${pendingIds.length} pending items as delivered?`)) {
                                handleMarkDelivered(pendingIds);
                            }
                        }}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                        <Check className="w-4 h-4" /> Mark All Pending Delivered ({deliveryItems.filter(d => d.status === 1).length})
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={filters.delivered}
                        onChange={(e) => setFilters({ ...filters, delivered: e.target.checked, not_delivered: false })}
                        className="rounded border-slate-600" />
                    Delivered Only
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={filters.not_delivered}
                        onChange={(e) => setFilters({ ...filters, not_delivered: e.target.checked, delivered: false })}
                        className="rounded border-slate-600" />
                    Not Delivered Only
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={filters.delivered_diff_qty}
                        onChange={(e) => setFilters({ ...filters, delivered_diff_qty: e.target.checked })}
                        className="rounded border-slate-600" />
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

            {/* Generate List Passcode Dialog */}
            {generateDialog && (
                <PasscodeDialog
                    title="Generate Delivery List"
                    selectedDate={selectedDate}
                    onConfirm={handleGenerateList}
                    onCancel={() => setGenerateDialog(false)}
                />
            )}

            {/* Delete List Passcode Dialog */}
            {deleteDialog && (
                <PasscodeDialog
                    title="Delete Delivery List"
                    selectedDate={selectedDate}
                    onConfirm={handleDeleteList}
                    onCancel={() => setDeleteDialog(false)}
                />
            )}

            {/* Edit Qty Modal */}
            {editQtyModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-sm mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Edit Quantity</h2>
                        <div className="space-y-3 mb-4">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Pre Delivery ID</label>
                                <input type="text" value={editQtyModal.item.pre_delivery_id} disabled
                                    className="w-full px-4 py-2 bg-slate-800/30 border border-slate-700/30 rounded-xl text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-400">
                                {editQtyModal.item.name} — {editQtyModal.item.title}
                            </p>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">New Quantity</label>
                                <input
                                    type="number"
                                    value={editQtyModal.newQty}
                                    onChange={(e) => setEditQtyModal({ ...editQtyModal, newQty: Number(e.target.value) })}
                                    min={0} autoFocus
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setEditQtyModal(null)}
                                className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl">Cancel</button>
                            <button onClick={handleUpdateQty} disabled={isSubmitting}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                                {isSubmitting ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
