'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import { useDrivers } from '@/hooks/useData';
import { useDeliveryList } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import { Calendar, RefreshCw, Plus, Truck, Edit, Check, Trash2, Download, AlertTriangle, Package, Navigation, Store } from 'lucide-react';
import { toast } from 'sonner';

// ====== Types ======
interface DeliveryItem {
    id: number;
    pre_delivery_id: number;
    order_id: number;
    user_id: number;
    product_id: number;
    name: string;
    s_phone: string;
    title: string;
    product_title: string;
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

interface ProductAgg { title: string; qty_text: string; qty: number; }
interface DriverGroup { driverName: string; products: ProductAgg[]; totalQty: number; }

// Dairy pickup drivers (matching React admin)
const DAIRY_PICKUP_DRIVERS = ['00 swarg office', '01  kanakpura', '01 kanakpura'];

// ====== Helpers ======
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
    try { return format(new Date(timestamp), 'hh:mm a'); } catch { return '-'; }
};

const composeAddress = (item: DeliveryItem) =>
    [item.flat_no, item.apartment_name, item.area, item.city, item.pincode].filter(Boolean).join(', ') || '-';

// Group items by driver → products (for routewise + dairy pickup)
function groupByDriver(items: DeliveryItem[], isDairyPickup: boolean): DriverGroup[] {
    const driverMap = new Map<string, Map<string, ProductAgg>>();
    items.forEach((item) => {
        const driver = item.delivery_boy_name || 'Unassigned';
        const isPickupDriver = DAIRY_PICKUP_DRIVERS.some(d => driver.toLowerCase().startsWith(d));
        if (isDairyPickup ? !isPickupDriver : isPickupDriver) return;

        if (!driverMap.has(driver)) driverMap.set(driver, new Map());
        const products = driverMap.get(driver)!;
        const key = item.product_title || item.title;
        if (!key) return;
        const existing = products.get(key);
        if (existing) { existing.qty += item.qty || 1; }
        else { products.set(key, { title: key, qty_text: item.qty_text || '', qty: item.qty || 1 }); }
    });
    return Array.from(driverMap.entries())
        .map(([driverName, products]) => ({
            driverName,
            products: Array.from(products.values()).sort((a, b) => a.title.localeCompare(b.title)),
            totalQty: Array.from(products.values()).reduce((sum, p) => sum + p.qty, 0),
        }))
        .sort((a, b) => {
            const aNum = parseInt(a.driverName.match(/^(\d+)/)?.[1] || '999');
            const bNum = parseInt(b.driverName.match(/^(\d+)/)?.[1] || '999');
            if (aNum !== bNum) return aNum - bNum;
            return a.driverName.localeCompare(b.driverName);
        });
}

// Aggregate products by title (for packing list)
function aggregateProducts(items: DeliveryItem[]): ProductAgg[] {
    const map = new Map<string, ProductAgg>();
    items.forEach((item) => {
        const key = item.product_title || item.title;
        if (!key) return;
        const existing = map.get(key);
        if (existing) { existing.qty += item.qty || 1; }
        else { map.set(key, { title: key, qty_text: item.qty_text || '', qty: item.qty || 1 }); }
    });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

// ====== Passcode Dialog ======
function PasscodeDialog({ title, selectedDate, onConfirm, onCancel }: {
    title: string; selectedDate: string; onConfirm: () => void; onCancel: () => void;
}) {
    const [passcode, setPasscode] = useState('');
    const [error, setError] = useState('');
    const today = format(new Date(), 'yyyy-MM-dd');
    const expectedPasscode = selectedDate.replace(/-/g, '');
    const isToday = selectedDate === today;

    const handleSubmit = () => {
        if (isToday) {
            if (passcode.toUpperCase() === 'TODAY') { onConfirm(); return; }
            setError('Incorrect passcode');
            return;
        }
        if (passcode === expectedPasscode) { onConfirm(); return; }
        setError('Incorrect passcode');
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                </div>
                <p className="text-sm text-slate-400 mb-4">Date: <span className="text-white font-medium">{selectedDate}</span></p>
                <input type="text" value={passcode}
                    onChange={(e) => { setPasscode(e.target.value); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="Enter passcode"
                    autoFocus
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <div className="flex gap-3 mt-4">
                    <button onClick={onCancel} className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl">Cancel</button>
                    <button onClick={handleSubmit} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">Confirm</button>
                </div>
            </div>
        </div>
    );
}

// ====== Driver Group Table (Routewise / Dairy Pickup) ======
function DriverGroupTable({ groups, emptyMsg, onExport }: { groups: DriverGroup[]; emptyMsg: string; onExport: () => void; }) {
    const totalQty = groups.reduce((sum, g) => sum + g.totalQty, 0);
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span><strong className="text-white">{groups.length}</strong> routes</span>
                    <span><strong className="text-purple-400">{totalQty}</strong> total qty</span>
                </div>
                <button onClick={onExport} disabled={groups.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-slate-300 hover:text-white disabled:opacity-40">
                    <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
            </div>
            {groups.length === 0 ? (
                <div className="glass rounded-xl p-12 text-center"><p className="text-slate-400">{emptyMsg}</p></div>
            ) : (
                groups.map((group) => (
                    <div key={group.driverName} className="glass rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between">
                            <h3 className="font-semibold text-white">{group.driverName}</h3>
                            <span className="text-sm text-purple-400 font-medium">{group.totalQty} qty</span>
                        </div>
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-800/50">
                                    <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium">Product Title</th>
                                    <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium w-32">Qty Text</th>
                                    <th className="text-right px-4 py-2 text-xs text-slate-400 font-medium w-24">Quantity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.products.map((p) => (
                                    <tr key={p.title} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                                        <td className="px-4 py-2.5 text-sm text-white">{p.title}</td>
                                        <td className="px-4 py-2.5 text-sm text-slate-400">{p.qty_text}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-sm font-bold">{p.qty}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))
            )}
        </div>
    );
}

// ====== Main Page ======
type TabId = 'orders' | 'routewise' | 'packing' | 'dairy';

export default function DeliveryListPage() {
    const router = useRouter();
    const today = format(new Date(), 'yyyy-MM-dd');
    const [selectedDate, setSelectedDate] = useState(today);
    const [selectedDriver, setSelectedDriver] = useState<number | ''>('');
    const [activeTab, setActiveTab] = useState<TabId>('orders');
    const [editQtyModal, setEditQtyModal] = useState<{ item: DeliveryItem; newQty: number } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [generateDialog, setGenerateDialog] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState(false);
    const [filters, setFilters] = useState({ delivered: false, not_delivered: false, delivered_diff_qty: false });
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [expandedCol, setExpandedCol] = useState<string | null>('edit_qty');

    const { data: drivers = [] } = useDrivers();

    // Single data source for all tabs
    const { data: rawItems = [], isLoading, isFetching, refetch } = useQuery({
        queryKey: ['delivery-list', selectedDate],
        queryFn: async () => {
            const response = await GET<DeliveryItem[]>(`/get_genrated_order_list/${selectedDate}`);
            return response.data || [];
        },
    });

    // Deduplicate
    const uniqueItems = useMemo(() => {
        const seen = new Set<number>();
        return rawItems.filter(item => {
            if (seen.has(item.pre_delivery_id)) return false;
            seen.add(item.pre_delivery_id);
            return true;
        });
    }, [rawItems]);

    // Tab 1: filtered orders
    const deliveryItems = useMemo(() => {
        let result = uniqueItems;
        if (selectedDriver) result = result.filter(item => item.order_assign_user === selectedDriver || item.delivery_boy_id === selectedDriver);
        if (filters.delivered) result = result.filter(item => item.status === 3);
        if (filters.not_delivered) result = result.filter(item => item.status !== 3);
        if (filters.delivered_diff_qty) result = result.filter(item => item.mark_delivered_qty !== null && item.qty !== item.mark_delivered_qty);
        return result;
    }, [uniqueItems, selectedDriver, filters]);

    // Tab 2: routewise products (excludes dairy pickup drivers)
    const routewiseGroups = useMemo(() => groupByDriver(uniqueItems as DeliveryItem[], false), [uniqueItems]);

    // Tab 3: packing list (aggregated by product)
    const packingProducts = useMemo(() => aggregateProducts(uniqueItems as DeliveryItem[]), [uniqueItems]);

    // Tab 4: dairy pickup (only dairy pickup drivers)
    const dairyGroups = useMemo(() => groupByDriver(uniqueItems as DeliveryItem[], true), [uniqueItems]);

    // ====== Actions ======
    const handleGenerateList = async () => {
        setGenerateDialog(false);
        setIsSubmitting(true);
        try {
            await POST('/genrate_order_list', { date: selectedDate });
            toast.success('Delivery list generated successfully');
            refetch();
        } catch { toast.error('Failed to generate delivery list'); }
        finally { setIsSubmitting(false); }
    };

    const handleDeleteList = async () => {
        setIsSubmitting(true);
        try {
            await POST('/delete_pre_delivery_list', { date: selectedDate });
            toast.success('Delivery list deleted');
            refetch();
        } catch { toast.error('Failed to delete delivery list'); }
        finally { setIsSubmitting(false); setDeleteDialog(false); }
    };

    const handleMarkDelivered = async (preDeliveryIds: number[]) => {
        if (preDeliveryIds.length === 0) return;
        setIsSubmitting(true);
        try {
            await POST('/mark_delivery', { orders_id: preDeliveryIds.join(', ') });
            toast.success(`${preDeliveryIds.length} items marked as delivered`);
            refetch();
        } catch { toast.error('Failed to mark as delivered'); }
        finally { setIsSubmitting(false); }
    };

    const handleUpdateQty = async () => {
        if (!editQtyModal) return;
        setIsSubmitting(true);
        try {
            await POST('/pre_delivery_update', { id: editQtyModal.item.pre_delivery_id, qty: editQtyModal.newQty });
            toast.success('Quantity updated');
            setEditQtyModal(null);
            refetch();
        } catch { toast.error('Failed to update quantity'); }
        finally { setIsSubmitting(false); }
    };

    // ====== Exports ======
    const exportDeliveryCSV = useCallback(() => {
        const headers = ['Pre ID', 'Order ID', 'Name', 'Phone', 'Product', 'Qty Text', 'Qty', 'Del Qty', 'Driver', 'Status', 'Del Date', 'Del Time', 'Address', 'Pincode', 'Wallet', 'Start Date', 'Sub Type'];
        const rows = deliveryItems.map(item => [
            item.pre_delivery_id, item.id, item.name, item.s_phone, item.title || item.product_title,
            item.qty_text, item.qty, item.mark_delivered_qty ?? '',
            item.delivery_boy_name || '', getStatusLabel(item.status).label,
            item.delivered_date || '', formatTime(item.mark_delivered_time_stamp),
            composeAddress(item), item.pincode, item.wallet_amount, item.start_date, getSubscriptionLabel(item.subscription_type)
        ]);
        downloadCSV([headers, ...rows.map(r => r.map(String))], `${selectedDate.replace(/-/g, '')}_Delivery-list.csv`);
    }, [deliveryItems, selectedDate]);

    const exportDriverGroupCSV = useCallback((groups: DriverGroup[], filename: string, firstCol: string) => {
        const rows: string[][] = [[firstCol, 'Product Title', 'Quantity Text', 'Quantity']];
        groups.forEach(g => g.products.forEach(p => rows.push([g.driverName, p.title, p.qty_text, String(p.qty)])));
        downloadCSV(rows, filename);
    }, []);

    const exportPackingCSV = useCallback(() => {
        const rows: string[][] = [['Product Title', 'Quantity Text', 'Quantity']];
        packingProducts.forEach(p => rows.push([p.title, p.qty_text, String(p.qty)]));
        downloadCSV(rows, `${selectedDate.replace(/-/g, '')}_Packing-list.csv`);
    }, [packingProducts, selectedDate]);

    // ====== Selection helpers ======
    const toggleSelect = (preDeliveryId: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(preDeliveryId)) next.delete(preDeliveryId);
            else next.add(preDeliveryId);
            return next;
        });
    };
    const toggleSelectAll = () => {
        const undelivered = deliveryItems.filter(d => d.status !== 3);
        if (selectedIds.size === undelivered.length && undelivered.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(undelivered.map(d => d.pre_delivery_id)));
        }
    };

    // Column width helper — expanded column gets more space
    const colW = (key: string, defaultW: string, expandedW: string) => expandedCol === key ? expandedW : defaultW;

    // ====== Columns ======
    const columns: Column<DeliveryItem>[] = [
        { key: 'select', header: '', width: '40px',
            render: (item) => (
                <input type="checkbox" checked={selectedIds.has(item.pre_delivery_id)} disabled={item.status === 3}
                    onChange={() => toggleSelect(item.pre_delivery_id)}
                    className="w-4 h-4 rounded border-slate-600 text-purple-500 focus:ring-purple-500 bg-slate-800/50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" />
            ) },
        { key: 'edit_qty', header: 'Qty Edit', width: colW('edit_qty', '70px', '120px'),
            render: (item) => <button onClick={(e) => { e.stopPropagation(); setEditQtyModal({ item, newQty: item.qty }); }} disabled={item.status === 3} className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-30" title="Edit quantity"><Edit className="w-3 h-3 text-blue-400" /></button> },
        { key: 'pre_delivery_id', header: 'Pre ID', width: colW('pre_delivery_id', '80px', '120px') },
        { key: 'id', header: 'Order ID', width: colW('id', '80px', '120px') },
        { key: 'name', header: 'Name', width: colW('name', '150px', '250px') },
        { key: 's_phone', header: 'Phone', width: colW('s_phone', '120px', '180px') },
        { key: 'title', header: 'Product', width: colW('title', '200px', '350px') },
        { key: 'qty_text', header: 'Qty Text', width: colW('qty_text', '120px', '200px') },
        { key: 'qty', header: 'Qty', width: colW('qty', '70px', '100px'), render: (item) => <span className="font-semibold">{item.qty}</span> },
        { key: 'mark_delivered_qty', header: 'Del Qty', width: colW('mark_delivered_qty', '80px', '120px'),
            render: (item) => { const isDiff = item.mark_delivered_qty !== null && item.mark_delivered_qty !== item.qty; return <span className={`font-medium ${isDiff ? 'text-red-400' : ''}`}>{item.mark_delivered_qty ?? '-'}</span>; } },
        { key: 'delivery_boy_name', header: 'Driver', width: colW('delivery_boy_name', '150px', '250px'), render: (item) => <span>{item.delivery_boy_name || 'Unassigned'}</span> },
        { key: 'status', header: 'Status', width: colW('status', '120px', '160px'),
            render: (item) => { const s = getStatusLabel(item.status); return <span className={`font-semibold ${s.color}`}>{s.label}</span>; } },
        { key: 'delivered_date', header: 'Del Date', width: colW('delivered_date', '110px', '160px') },
        { key: 'mark_delivered_time_stamp', header: 'Del Time', width: colW('mark_delivered_time_stamp', '100px', '150px'), render: (item) => <span className="text-sm">{formatTime(item.mark_delivered_time_stamp)}</span> },
        { key: 'address', header: 'Address', width: colW('address', '220px', '400px'),
            render: (item) => <span className="text-sm text-slate-300 truncate block" style={{ maxWidth: expandedCol === 'address' ? '380px' : '200px' }} title={composeAddress(item)}>{composeAddress(item)}</span> },
        { key: 'pincode', header: 'Pincode', width: colW('pincode', '100px', '140px') },
        { key: 'wallet_amount', header: 'Wallet', width: colW('wallet_amount', '100px', '140px'), render: (item) => <span className="text-green-400">₹{item.wallet_amount || 0}</span> },
        { key: 'start_date', header: 'Start Date', width: colW('start_date', '110px', '160px') },
        { key: 'subscription_type', header: 'Sub Type', width: colW('subscription_type', '130px', '180px'), render: (item) => <span className="text-xs">{getSubscriptionLabel(item.subscription_type)}</span> },
    ];

    const packingColumns: Column<ProductAgg>[] = [
        { key: 'title', header: 'Product Title' },
        { key: 'qty_text', header: 'Quantity Text', width: '150px' },
        { key: 'qty', header: 'Quantity', width: '100px', render: (item) => <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-sm font-bold">{item.qty}</span> },
    ];

    const stats = {
        total: deliveryItems.length,
        pending: deliveryItems.filter(d => d.status === 1).length,
        notDelivered: deliveryItems.filter(d => d.status === 2).length,
        delivered: deliveryItems.filter(d => d.status === 3).length,
    };

    const tabs: { id: TabId; label: string; icon: React.ReactNode; count: number }[] = [
        { id: 'orders', label: 'Customer Orders', icon: <Truck className="w-4 h-4" />, count: deliveryItems.length },
        { id: 'routewise', label: 'Routewise Products', icon: <Navigation className="w-4 h-4" />, count: routewiseGroups.reduce((s, g) => s + g.totalQty, 0) },
        { id: 'packing', label: 'Packing List', icon: <Package className="w-4 h-4" />, count: packingProducts.reduce((s, p) => s + p.qty, 0) },
        { id: 'dairy', label: 'Dairy Pickup', icon: <Store className="w-4 h-4" />, count: dairyGroups.reduce((s, g) => s + g.totalQty, 0) },
    ];

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
                        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                            className="pl-10 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer" />
                    </div>
                    {activeTab === 'orders' && (
                        <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value ? Number(e.target.value) : '')}
                            className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white">
                            <option value="">All Drivers</option>
                            {[...drivers].sort((a, b) => a.name.localeCompare(b.name)).map(d => (
                                <option key={d.id} value={d.user_id}>{d.name}</option>
                            ))}
                        </select>
                    )}
                    <button onClick={() => refetch()} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:bg-slate-700/50">
                        <RefreshCw className={`w-5 h-5 text-slate-400 ${isFetching ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Action Buttons (only on orders tab) */}
            {activeTab === 'orders' && (
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => setGenerateDialog(true)} disabled={isSubmitting}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium disabled:opacity-50">
                        {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        {isSubmitting ? 'Generating...' : 'Generate List'}
                    </button>
                    <button onClick={() => setDeleteDialog(true)} disabled={isSubmitting}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-medium disabled:opacity-50">
                        <Trash2 className="w-4 h-4" /> Delete List
                    </button>
                    <button onClick={exportDeliveryCSV} disabled={deliveryItems.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white disabled:opacity-40">
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                    {selectedIds.size > 0 && (
                        <button
                            onClick={() => handleMarkDelivered(Array.from(selectedIds)).then(() => setSelectedIds(new Set()))}
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                            <Check className="w-4 h-4" /> Mark Selected Delivered ({selectedIds.size})
                        </button>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        <label className="text-xs text-slate-400">Expand:</label>
                        <select value={expandedCol || ''} onChange={(e) => setExpandedCol(e.target.value || null)}
                            className="px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-white">
                            <option value="">None</option>
                            <option value="edit_qty">Qty Edit</option>
                            <option value="name">Name</option>
                            <option value="title">Product</option>
                            <option value="qty_text">Qty Text</option>
                            <option value="delivery_boy_name">Driver</option>
                            <option value="address">Address</option>
                            <option value="subscription_type">Sub Type</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-900/50 rounded-xl p-1 overflow-x-auto">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                            activeTab === tab.id
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}>
                        {tab.icon}
                        {tab.label}
                        <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-800 text-slate-500'}`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'orders' && (
                <>
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                            <input type="checkbox"
                                checked={selectedIds.size > 0 && selectedIds.size === deliveryItems.filter(d => d.status !== 3).length}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-slate-600 text-purple-500 focus:ring-purple-500 bg-slate-800/50 cursor-pointer" />
                            Select All Undelivered
                        </label>
                        <span className="text-slate-700">|</span>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input type="checkbox" checked={filters.delivered}
                                onChange={(e) => setFilters({ ...filters, delivered: e.target.checked, not_delivered: false })} className="rounded border-slate-600" />
                            Delivered Only
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input type="checkbox" checked={filters.not_delivered}
                                onChange={(e) => setFilters({ ...filters, not_delivered: e.target.checked, delivered: false })} className="rounded border-slate-600" />
                            Not Delivered Only
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input type="checkbox" checked={filters.delivered_diff_qty}
                                onChange={(e) => setFilters({ ...filters, delivered_diff_qty: e.target.checked })} className="rounded border-slate-600" />
                            Different Qty Delivered
                        </label>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Total</p><p className="text-2xl font-bold text-white">{stats.total}</p></div>
                        <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Pending</p><p className="text-2xl font-bold text-slate-300">{stats.pending}</p></div>
                        <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Not Delivered</p><p className="text-2xl font-bold text-red-400">{stats.notDelivered}</p></div>
                        <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Delivered</p><p className="text-2xl font-bold text-green-400">{stats.delivered}</p></div>
                    </div>

                    {/* Data Table */}
                    <DataTable data={deliveryItems} columns={columns} loading={isLoading || isSubmitting} pageSize={50}
                        searchPlaceholder="Search deliveries..." emptyMessage="No deliveries found for this date"
                        onRowClick={(item) => router.push(`/orders/${item.id}`)} />
                </>
            )}

            {activeTab === 'routewise' && (
                <DriverGroupTable groups={routewiseGroups} emptyMsg="No delivery data. Generate the delivery list first."
                    onExport={() => exportDriverGroupCSV(routewiseGroups, `Routewise_Products_${selectedDate}.csv`, 'Delivery Boy')} />
            )}

            {activeTab === 'packing' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-slate-400">
                            <span><strong className="text-white">{packingProducts.length}</strong> products</span>
                            <span><strong className="text-purple-400">{packingProducts.reduce((s, p) => s + p.qty, 0)}</strong> total qty</span>
                        </div>
                        <button onClick={exportPackingCSV} disabled={packingProducts.length === 0}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-slate-300 hover:text-white disabled:opacity-40">
                            <Download className="w-3.5 h-3.5" /> Export CSV
                        </button>
                    </div>
                    <DataTable data={packingProducts} columns={packingColumns} loading={isLoading} pageSize={50}
                        searchPlaceholder="Search products..." emptyMessage="No items. Generate the delivery list first." />
                </div>
            )}

            {activeTab === 'dairy' && (
                <DriverGroupTable groups={dairyGroups} emptyMsg="No dairy pickup data for this date."
                    onExport={() => exportDriverGroupCSV(dairyGroups, `Dairy_Pickup_${selectedDate}.csv`, 'Pickup Point')} />
            )}

            {/* Dialogs */}
            {generateDialog && <PasscodeDialog title="Generate Delivery List" selectedDate={selectedDate} onConfirm={handleGenerateList} onCancel={() => setGenerateDialog(false)} />}
            {deleteDialog && <PasscodeDialog title="Delete Delivery List" selectedDate={selectedDate} onConfirm={handleDeleteList} onCancel={() => setDeleteDialog(false)} />}

            {/* Edit Qty Modal */}
            {editQtyModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-sm mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Edit Quantity</h2>
                        <div className="space-y-3 mb-4">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Pre Delivery ID</label>
                                <input type="text" value={editQtyModal.item.pre_delivery_id} disabled className="w-full px-4 py-2 bg-slate-800/30 border border-slate-700/30 rounded-xl text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-400">{editQtyModal.item.name} — {editQtyModal.item.title}</p>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">New Quantity</label>
                                <input type="number" value={editQtyModal.newQty}
                                    onChange={(e) => setEditQtyModal({ ...editQtyModal, newQty: Number(e.target.value) })}
                                    min={0} autoFocus className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setEditQtyModal(null)} className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl">Cancel</button>
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

// CSV download utility
function downloadCSV(rows: string[][], filename: string) {
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
