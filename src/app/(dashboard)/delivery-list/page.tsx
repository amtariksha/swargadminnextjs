'use client';

import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { format, addDays } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import { useDrivers } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import DriverGroupTable from '@/components/DriverGroupTable';
import {
    type DeliveryItem,
    type DriverGroup,
    type ProductAgg,
    aggregateProducts,
    composeAddress,
    composeAddressForExport,
    dedupeDeliveryItems,
    getStatusLabel,
    getSubscriptionLabel,
    groupByDriver,
} from '@/lib/deliveryHelpers';
import { Calendar, RefreshCw, Plus, Truck, Edit, Check, Trash2, Download, AlertTriangle, Package, Navigation, Store, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';

// formatTime is page-local — only used by the Customer Orders tab in this file.
const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '-';
    try { return format(new Date(timestamp), 'hh:mm a'); } catch { return '-'; }
};

// ====== Passcode Dialog ======
// strictToday=true: when the selected date is *today*, requires the passcode
// "TODAY" + YYYYMMDD (e.g. TODAY20260505). Used by the Delete flow because
// deleting today's list mid-route would wipe the data drivers are actively
// using — the extra characters force deliberate typing.
// strictToday=false (default): today still accepts plain "TODAY".
// Future dates always use plain YYYYMMDD regardless of this flag.
function PasscodeDialog({ title, selectedDate, onConfirm, onCancel, strictToday = false }: {
    title: string;
    selectedDate: string;
    onConfirm: () => void;
    onCancel: () => void;
    strictToday?: boolean;
}) {
    const [passcode, setPasscode] = useState('');
    const [error, setError] = useState('');
    const today = format(new Date(), 'yyyy-MM-dd');
    const dateDigits = selectedDate.replace(/-/g, '');     // e.g. 20260505
    const isToday = selectedDate === today;

    const handleSubmit = () => {
        const entered = passcode.toUpperCase();
        if (isToday) {
            const required = strictToday ? `TODAY${dateDigits}` : 'TODAY';
            if (entered === required) { onConfirm(); return; }
            setError('Incorrect passcode');
            return;
        }
        // Future dates: YYYYMMDD (case-insensitive — only digits)
        if (entered === dateDigits) { onConfirm(); return; }
        setError('Incorrect passcode');
    };

    // Build a friendly hint so admins know the format without revealing the code itself.
    const hintFormat = isToday
        ? (strictToday ? 'TODAYYYYYMMDD (e.g. TODAY20260505)' : 'TODAY')
        : 'YYYYMMDD (8 digits)';

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle className={`w-6 h-6 ${strictToday && isToday ? 'text-red-400' : 'text-amber-400'}`} />
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                </div>
                <p className="text-sm text-slate-400 mb-1">Date: <span className="text-white font-medium">{selectedDate}</span></p>
                {strictToday && isToday && (
                    <p className="text-xs text-red-300 mb-3">
                        ⚠ Deleting today&apos;s list will erase data the drivers are actively using. Type the full safety code to confirm.
                    </p>
                )}
                <p className="text-xs text-slate-500 mb-3">Passcode format: <span className="text-slate-300 font-mono">{hintFormat}</span></p>
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

// (DriverGroupTable lives in src/components/DriverGroupTable.tsx so the
// driver-facing /production-delivery page can render the same view.)

// ====== Main Page ======
type TabId = 'orders' | 'routewise' | 'packing' | 'dairy';

// Shape of the genrate_order_list dry-run response (Feature 05-E).
interface DryRunPartial { orderId: number; userId: number; customerName: string; deliveredQty: number; orderedQty: number; }
interface DryRunSkip { orderId: number; userId: number; customerName: string; orderedQty: number; }
interface DryRunUnassigned { order_id: number; user_id: number; customer_name: string; }
interface DryRunResult {
    date: string;
    considered: number;
    would_insert: number;
    partials: DryRunPartial[];
    skips: DryRunSkip[];
    unassigned: DryRunUnassigned[];
}
interface CheckState {
    loading: boolean;
    date: string;
    result?: DryRunResult;
    error?: string;
}

export default function DeliveryListPage() {
    const router = useRouter();
    const today = format(new Date(), 'yyyy-MM-dd');
    const [selectedDate, setSelectedDate] = useState(today);
    const [selectedDriver, setSelectedDriver] = useState<number | ''>('');
    const [activeTab, setActiveTab] = useState<TabId>('orders');
    const [editQtyModal, setEditQtyModal] = useState<{ item: DeliveryItem; newQty: number } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [generateDialog, setGenerateDialog] = useState(false);
    // Progress overlay shown while genrate_order_list is running.
    // The endpoint can take a few seconds to a minute on large dates.
    const [genProgress, setGenProgress] = useState<{
        active: boolean;
        startedAt: number;
        result?: { inserted: number; skipped_existing: number; took_ms: number };
        error?: string;
    } | null>(null);
    const [deleteDialog, setDeleteDialog] = useState(false);
    const [filters, setFilters] = useState({ delivered: false, not_delivered: false, delivered_diff_qty: false });
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [expandedCol, setExpandedCol] = useState<string | null>('edit_qty');
    // "Check deliveries" pre-flight (Feature 05-E): a dry-run for tomorrow.
    const [checkState, setCheckState] = useState<CheckState | null>(null);

    const { data: drivers = [] } = useDrivers();

    // Single data source for all tabs
    const { data: rawItems = [], isLoading, isFetching, refetch } = useQuery({
        queryKey: ['delivery-list', selectedDate],
        queryFn: async () => {
            const response = await GET<DeliveryItem[]>(`/get_genrated_order_list/${selectedDate}`);
            return response.data || [];
        },
    });

    // dedupeDeliveryItems keeps one row per pre_delivery_id, preferring the
    // one with driver info — see src/lib/deliveryHelpers.ts.
    const uniqueItems = useMemo(() => dedupeDeliveryItems(rawItems), [rawItems]);

    // Tab 1: filtered orders
    const deliveryItems = useMemo(() => {
        let result = uniqueItems;
        if (selectedDriver) result = result.filter(item => item.order_assign_user === selectedDriver || item.delivery_boy_id === selectedDriver);
        if (filters.delivered) result = result.filter(item => item.status === 3);
        if (filters.not_delivered) result = result.filter(item => item.status !== 3);
        // "Different qty delivered" must compare actual-delivered against
        // the LIVE scheduled qty, not the original orders.qty — otherwise an
        // edit from 1→3 followed by a correct 3-qty delivery would falsely
        // show as "different". Use `??` not `||` so an explicit 0
        // (operator zeroed → "skip") is preserved as the live value.
        if (filters.delivered_diff_qty) result = result.filter(item => {
            if (item.mark_delivered_qty == null) return false;
            const live = item.delivered_qty ?? item.qty;
            return item.mark_delivered_qty !== live;
        });
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
        const startedAt = Date.now();
        setGenProgress({ active: true, startedAt });
        try {
            const response = await POST<{
                date: string;
                inserted: number;
                skipped_existing: number;
                took_ms: number;
            }>('/genrate_order_list', { date: selectedDate });
            const data = response?.data;
            const result = data
                ? {
                    inserted: data.inserted ?? 0,
                    skipped_existing: data.skipped_existing ?? 0,
                    took_ms: data.took_ms ?? Date.now() - startedAt,
                  }
                : { inserted: 0, skipped_existing: 0, took_ms: Date.now() - startedAt };
            setGenProgress({ active: false, startedAt, result });
            const summary = `Created ${result.inserted} new entries (skipped ${result.skipped_existing} existing) in ${(result.took_ms / 1000).toFixed(1)}s`;
            toast.success(summary);
            refetch();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to generate delivery list';
            setGenProgress({ active: false, startedAt, error: msg });
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Pre-flight: dry-run the generation for TOMORROW (the date the
    // auto-generate cron will produce) and show the problem list — orders
    // that would be skipped/partial for low balance, or have no driver.
    // Writes nothing.
    const handleCheckDeliveries = async () => {
        const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
        setCheckState({ loading: true, date: tomorrow });
        try {
            const response = await POST<DryRunResult>('/genrate_order_list', { date: tomorrow, dryRun: true });
            setCheckState({ loading: false, date: tomorrow, result: response?.data });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to check deliveries';
            setCheckState({ loading: false, date: tomorrow, error: msg });
        }
    };

    const handleDeleteList = async () => {
        setIsSubmitting(true);
        try {
            await POST('/delete_pre_delivery_list', { date: selectedDate });
            toast.success('Delivery list deleted');
            refetch();
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to delete delivery list'); }
        finally { setIsSubmitting(false); setDeleteDialog(false); }
    };

    const handleMarkDelivered = async (preDeliveryIds: number[]) => {
        if (preDeliveryIds.length === 0) return;
        setIsSubmitting(true);
        try {
            await POST('/mark_delivery', { orders_id: preDeliveryIds.join(', ') });
            toast.success(`${preDeliveryIds.length} items marked as delivered`);
            refetch();
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to mark as delivered'); }
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
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to update quantity'); }
        finally { setIsSubmitting(false); }
    };

    // ====== Exports ======
    // Laravel-parity headers + address formatting. Used by both the
    // search-bar export button (via DataTable onExport) and internal callers.
    const buildDeliveryCsvRows = useCallback((rows: DeliveryItem[]): string[][] => {
        const headers = [
            'Edit', 'Edit Qty',
            'Pre ID', 'Order ID', 'Txn ID', 'Price', 'Amount', 'Deducted',
            'Name', 'Phone',
            'Title', 'Quantity Text', 'Quantity', 'Delivered Quantity',
            'Delivery Boy', 'Delivery Status', 'Delivered Date', 'Delivered Time',
            'Address', 'Pincode', 'Wallet Balance', 'Start Date', 'Subscription Type',
        ];
        const body = rows.map(item => [
            '', '', // Edit / Edit Qty — UI-only buttons in Laravel, exported as empty cells
            item.pre_delivery_id, item.id,
            item.trasation_id ?? '', item.product_price ?? 0, item.order_amount ?? 0, item.trasation_amount ?? '',
            item.name, item.s_phone,
            item.title || item.product_title,
            // "Quantity" = LIVE scheduled qty (delivered_qty when edited, else
            // orders.qty). Required so the printed/exported list matches the
            // routewise/packing aggregations and the driver's actual route sheet.
            // `??` not `||` so an explicit 0 ("skip") is preserved.
            item.qty_text, item.delivered_qty ?? item.qty, item.mark_delivered_qty ?? '',
            item.delivery_boy_name || '',
            getStatusLabel(item.status).label,
            item.delivered_date || '',
            item.mark_delivered_time_stamp ? formatTime(item.mark_delivered_time_stamp) : '',
            composeAddressForExport(item),
            item.pincode,
            item.wallet_amount,
            item.start_date,
            getSubscriptionLabel(item.subscription_type),
        ]);
        return [headers, ...body.map(r => r.map(v => (v === null || v === undefined ? '' : String(v))))];
    }, []);

    const exportDeliveryCSV = useCallback((rowsToExport?: DeliveryItem[]) => {
        const source = rowsToExport ?? deliveryItems;
        downloadCSV(buildDeliveryCsvRows(source), `${selectedDate.replace(/-/g, '')}_Delivery-list.csv`);
    }, [deliveryItems, selectedDate, buildDeliveryCsvRows]);

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
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(item.pre_delivery_id)}
                    className="w-4 h-4 rounded border-slate-600 text-purple-500 focus:ring-purple-500 bg-slate-800/50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" />
            ) },
        { key: 'edit_qty', header: 'Qty Edit', width: colW('edit_qty', '70px', '120px'),
            // Seed the modal with the LIVE scheduled qty (delivered_qty) — not
            // the static orders.qty — so re-opening Edit on a previously-edited
            // row shows what was last saved instead of the original order qty.
            // Use `??` not `||` so an explicit 0 ("skip this delivery") is
            // preserved when the operator re-opens the modal.
            render: (item) => <button onClick={(e) => { e.stopPropagation(); setEditQtyModal({ item, newQty: item.delivered_qty ?? item.qty }); }} disabled={item.status === 3} className="p-1.5 hover:bg-slate-800/50 rounded-lg disabled:opacity-30" title="Edit quantity"><Edit className="w-3 h-3 text-blue-400" /></button> },
        { key: 'pre_delivery_id', header: 'Pre ID', width: colW('pre_delivery_id', '80px', '120px') },
        { key: 'id', header: 'Order ID', width: colW('id', '80px', '120px') },
        { key: 'trasation_id', header: 'Txn ID', width: colW('trasation_id', '80px', '120px'),
            render: (item) => <span className="text-xs text-slate-400">{item.trasation_id ?? '-'}</span> },
        { key: 'product_price', header: 'Price', width: colW('product_price', '80px', '110px'),
            render: (item) => <span>₹{item.product_price ?? 0}</span> },
        { key: 'order_amount', header: 'Amount', width: colW('order_amount', '90px', '120px'),
            render: (item) => <span>₹{item.order_amount ?? 0}</span> },
        { key: 'trasation_amount', header: 'Deducted', width: colW('trasation_amount', '90px', '120px'),
            render: (item) => <span className={item.trasation_amount == null ? 'text-slate-500' : ''}>{item.trasation_amount == null ? '-' : `₹${item.trasation_amount}`}</span> },
        { key: 'name', header: 'Name', width: colW('name', '150px', '250px') },
        { key: 's_phone', header: 'Phone', width: colW('s_phone', '120px', '180px') },
        { key: 'title', header: 'Product', width: colW('title', '200px', '350px') },
        { key: 'qty_text', header: 'Qty Text', width: colW('qty_text', '120px', '200px') },
        // "Qty" shows the LIVE scheduled qty (delivered_qty if edited, else
        // orders.qty). When admin edits via Qty Edit, this column updates and
        // the value is highlighted so the edit is immediately visible.
        // 0 = "skip this delivery"; rendered amber + struck through so the
        // intent is unambiguous to anyone scanning the list.
        // Use `??` not `||` so 0 isn't silently treated as "no override".
        { key: 'qty', header: 'Qty', width: colW('qty', '70px', '100px'),
            render: (item) => {
                const live = item.delivered_qty ?? item.qty;
                const wasEdited = typeof item.delivered_qty === 'number' && item.delivered_qty !== item.qty;
                const isZero = live === 0;
                const cls = isZero
                    ? 'text-amber-400 line-through'
                    : wasEdited ? 'text-amber-400' : '';
                const tip = isZero
                    ? `Skipped today (was ${item.qty})`
                    : wasEdited ? `Edited from ${item.qty}` : undefined;
                return <span className={`font-semibold ${cls}`} title={tip}>{live}</span>;
            } },
        // "Del Qty" shows what was actually delivered (set when driver/admin
        // marks delivery). Highlighted red when it differs from the SCHEDULED
        // (live) qty — i.e. the customer got something different from what
        // was on the route sheet.
        { key: 'mark_delivered_qty', header: 'Del Qty', width: colW('mark_delivered_qty', '80px', '120px'),
            render: (item) => {
                const live = item.delivered_qty ?? item.qty;
                const isDiff = item.mark_delivered_qty !== null && item.mark_delivered_qty !== live;
                return <span className={`font-medium ${isDiff ? 'text-red-400' : ''}`}>{item.mark_delivered_qty ?? '-'}</span>;
            } },
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
                    <button onClick={handleCheckDeliveries} disabled={isSubmitting || checkState?.loading}
                        title="Dry-run tomorrow's generation — shows low-balance and missing-driver problems without creating anything"
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl font-medium disabled:opacity-50">
                        {checkState?.loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                        Check deliveries
                    </button>
                    <button onClick={() => setDeleteDialog(true)} disabled={isSubmitting}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-medium disabled:opacity-50">
                        <Trash2 className="w-4 h-4" /> Delete List
                    </button>
                    {/* Export CSV lives next to the search bar inside the DataTable, per user preference */}
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
                    <DataTable
                        data={deliveryItems}
                        columns={columns}
                        loading={isLoading || isSubmitting}
                        pageSize={50}
                        searchPlaceholder="Search deliveries..."
                        emptyMessage="No deliveries found for this date"
                        onRowClick={(item) => router.push(`/orders/${item.id}`)}
                        onExport={(filteredRows) => exportDeliveryCSV(filteredRows)}
                    />
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
            {deleteDialog && <PasscodeDialog title="Delete Delivery List" selectedDate={selectedDate} onConfirm={handleDeleteList} onCancel={() => setDeleteDialog(false)} strictToday />}
            {genProgress && (
                <GenerateProgressModal
                    state={genProgress}
                    selectedDate={selectedDate}
                    onClose={() => setGenProgress(null)}
                />
            )}
            {checkState && (
                <CheckDeliveriesModal state={checkState} onClose={() => setCheckState(null)} />
            )}

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

// ====== Generate Progress Modal ======
// Indeterminate progress bar with live elapsed-time counter while
// genrate_order_list is running. After the request settles, switches to a
// summary view so the admin can see what changed before dismissing.
interface GenProgressState {
    active: boolean;
    startedAt: number;
    result?: { inserted: number; skipped_existing: number; took_ms: number };
    error?: string;
}

function GenerateProgressModal({
    state,
    selectedDate,
    onClose,
}: {
    state: GenProgressState;
    selectedDate: string;
    onClose: () => void;
}) {
    const [now, setNow] = useState<number>(Date.now());

    useEffect(() => {
        if (!state.active) return;
        const interval = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(interval);
    }, [state.active]);

    const elapsedSeconds = ((state.active ? now : state.startedAt + (state.result?.took_ms ?? 0)) - state.startedAt) / 1000;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                {state.active && (
                    <>
                        <div className="flex items-center gap-3 mb-3">
                            <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
                            <h2 className="text-lg font-bold text-white">Generating Delivery List</h2>
                        </div>
                        <p className="text-sm text-slate-400 mb-1">
                            Date: <span className="text-white font-medium">{selectedDate}</span>
                        </p>
                        <p className="text-xs text-slate-500 mb-4">
                            Scanning subscriptions, applying wallet rules, and creating delivery rows.
                        </p>
                        {/* Indeterminate progress bar */}
                        <div className="h-2 w-full bg-slate-800/60 rounded-full overflow-hidden mb-3 relative">
                            <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-[progress-slide_1.4s_ease-in-out_infinite]" />
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>Elapsed: <span className="text-white font-medium">{elapsedSeconds.toFixed(1)}s</span></span>
                            <span>Don&apos;t close this tab</span>
                        </div>
                        <style jsx>{`
                            @keyframes progress-slide {
                                0% { left: -33%; }
                                100% { left: 100%; }
                            }
                            div[class*="animate-\\[progress-slide"] {
                                animation: progress-slide 1.4s ease-in-out infinite;
                            }
                        `}</style>
                    </>
                )}

                {!state.active && state.result && (
                    <>
                        <div className="flex items-center gap-3 mb-4">
                            <Check className="w-6 h-6 text-green-400" />
                            <h2 className="text-lg font-bold text-white">List Generated</h2>
                        </div>
                        <div className="space-y-2 mb-5">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Date</span>
                                <span className="text-white font-medium">{selectedDate}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">New entries created</span>
                                <span className="text-green-400 font-medium">{state.result.inserted}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Skipped (already existed)</span>
                                <span className="text-slate-300 font-medium">{state.result.skipped_existing}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Time taken</span>
                                <span className="text-white font-medium">{(state.result.took_ms / 1000).toFixed(1)}s</span>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium"
                        >
                            Close
                        </button>
                    </>
                )}

                {!state.active && state.error && (
                    <>
                        <div className="flex items-center gap-3 mb-3">
                            <AlertTriangle className="w-6 h-6 text-red-400" />
                            <h2 className="text-lg font-bold text-white">Generation Failed</h2>
                        </div>
                        <p className="text-sm text-red-300 mb-4">{state.error}</p>
                        <p className="text-xs text-slate-500 mb-4">
                            If this was a network/timeout error, the database may still have been updated. Refresh the table to verify.
                        </p>
                        <button
                            onClick={onClose}
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl font-medium"
                        >
                            Close
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

// ====== Check Deliveries Modal ======
// Renders the genrate_order_list dry-run problem list for tomorrow:
// orders that would be skipped/partially delivered for low balance, and
// orders with no driver assigned. The admin fixes these before the
// auto-generate cron runs at the daily cutoff.
function ProblemSection({ title, tone, children }: {
    title: string;
    tone: 'red' | 'amber';
    children: ReactNode;
}) {
    const color = tone === 'red' ? 'text-red-400' : 'text-amber-400';
    return (
        <div>
            <h3 className={`text-sm font-semibold ${color} mb-1`}>{title}</h3>
            <ul className="text-xs text-slate-300 space-y-1 bg-slate-800/40 rounded-xl px-3 py-2 max-h-48 overflow-y-auto">
                {children}
            </ul>
        </div>
    );
}

function CheckDeliveriesModal({ state, onClose }: {
    state: CheckState;
    onClose: () => void;
}) {
    const r = state.result;
    const problemCount = r ? r.unassigned.length + r.skips.length + r.partials.length : 0;
    const allClear = !!r && problemCount === 0;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center gap-3 mb-4">
                    {state.loading
                        ? <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                        : state.error
                            ? <AlertTriangle className="w-6 h-6 text-red-400" />
                            : allClear
                                ? <Check className="w-6 h-6 text-green-400" />
                                : <ClipboardCheck className="w-6 h-6 text-amber-400" />}
                    <h2 className="text-lg font-bold text-white">Check Deliveries — {state.date}</h2>
                </div>

                {state.loading && (
                    <p className="text-sm text-slate-400">
                        Running a dry-run for tomorrow — no delivery rows are created.
                    </p>
                )}

                {!state.loading && state.error && (
                    <p className="text-sm text-red-300">{state.error}</p>
                )}

                {!state.loading && r && (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-400">
                            <span className="text-white font-medium">{r.would_insert}</span> delivery row(s)
                            would be created from {r.considered} order(s) considered.
                        </p>
                        {allClear && (
                            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                                <Check className="w-4 h-4" /> No problems — tomorrow&apos;s list will generate clean.
                            </div>
                        )}
                        {r.unassigned.length > 0 && (
                            <ProblemSection title={`No driver assigned (${r.unassigned.length})`} tone="red">
                                {r.unassigned.map(u => (
                                    <li key={u.order_id} className="flex justify-between gap-2">
                                        <span>Order #{u.order_id} — {u.customer_name || `User ${u.user_id}`}</span>
                                    </li>
                                ))}
                            </ProblemSection>
                        )}
                        {r.skips.length > 0 && (
                            <ProblemSection title={`Not delivered — low balance (${r.skips.length})`} tone="amber">
                                {r.skips.map(s => (
                                    <li key={s.orderId} className="flex justify-between gap-2">
                                        <span>Order #{s.orderId} — {s.customerName || `User ${s.userId}`}</span>
                                        <span className="text-slate-500 whitespace-nowrap">{s.orderedQty} ordered</span>
                                    </li>
                                ))}
                            </ProblemSection>
                        )}
                        {r.partials.length > 0 && (
                            <ProblemSection title={`Partial delivery — low balance (${r.partials.length})`} tone="amber">
                                {r.partials.map(p => (
                                    <li key={p.orderId} className="flex justify-between gap-2">
                                        <span>Order #{p.orderId} — {p.customerName || `User ${p.userId}`}</span>
                                        <span className="text-slate-500 whitespace-nowrap">{p.deliveredQty} of {p.orderedQty}</span>
                                    </li>
                                ))}
                            </ProblemSection>
                        )}
                    </div>
                )}

                <button onClick={onClose} disabled={state.loading}
                    className="mt-5 w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl font-medium disabled:opacity-50">
                    Close
                </button>
            </div>
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
