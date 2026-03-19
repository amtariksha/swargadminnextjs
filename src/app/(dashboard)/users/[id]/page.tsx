'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
    useUser, useUserOrders, useUserTransactions, useUserHolidays, useUserAddresses,
    useUserDeliveryHistory, useAddHoliday, useDeleteHoliday, useAddTransaction,
    useAddAddress, useUpdateAddress, useDeleteAddress,
    type UserTransaction, type UserHoliday, type Address,
} from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import TabPanel from '@/components/TabPanel';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { inputClassName, selectClassName } from '@/components/FormField';
import {
    ArrowLeft, Edit, Plus, Phone, Mail, MapPin, Wallet, ShoppingCart,
    Calendar, Truck, CreditCard, Trash2, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

const ORDER_TYPE_LABELS: Record<number, string> = { 1: 'Prepaid', 2: 'Postpaid', 3: 'Pay Now', 4: 'Pay Later' };
const SUB_TYPE_LABELS: Record<number, string> = { 1: 'One Time', 2: 'Weekly', 3: 'Daily', 4: 'Alternative' };
const TXN_DESCRIPTIONS = ['Cash Deposit', 'Recharge', 'Bank Transfer', 'Cheque Payment Via Payment Gateway', 'Refund', 'Referral Bonus'];

export default function UserDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState(0);

    // Modals
    const [showHolidayModal, setShowHolidayModal] = useState(false);
    const [showTxnModal, setShowTxnModal] = useState(false);
    const [showRefundModal, setShowRefundModal] = useState<UserTransaction | null>(null);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [editAddress, setEditAddress] = useState<Address | null>(null);
    const [deleteHoliday, setDeleteHoliday] = useState<UserHoliday | null>(null);
    const [deleteAddr, setDeleteAddr] = useState<Address | null>(null);

    // Form state
    const [holidayStartDate, setHolidayStartDate] = useState('');
    const [holidayEndDate, setHolidayEndDate] = useState('');
    const [txnForm, setTxnForm] = useState({ amount: '', type: '1', description: '', payment_mode: '1' });
    const [addrForm, setAddrForm] = useState({ name: '', s_phone: '', flat_no: '', apartment_name: '', area: '', landmark: '', city: '', pincode: '', lat: '', lng: '' });

    // Log filters for All Activity tab
    const [logFilters, setLogFilters] = useState({ orders: true, transactions: true, holidays: true, deliveries: true });

    // Data
    const { data: user, isLoading } = useUser(id);
    const { data: orders = [] } = useUserOrders(id);
    const { data: transactions = [] } = useUserTransactions(id);
    const { data: holidays = [] } = useUserHolidays(id);
    const { data: addresses = [] } = useUserAddresses(id);
    const { data: deliveryHistory = [] } = useUserDeliveryHistory(id);

    // Mutations
    const addHolidayMutation = useAddHoliday();
    const deleteHolidayMutation = useDeleteHoliday();
    const addTxnMutation = useAddTransaction();
    const addAddressMutation = useAddAddress();
    const updateAddressMutation = useUpdateAddress();
    const deleteAddressMutation = useDeleteAddress();

    // ====== Unified Activity Log ======
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allActivity = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: any[] = [];
        if (logFilters.orders) orders.forEach((o: Record<string, unknown>) => items.push({ ...o, log_type: 'Order', sort_date: o.created_at || o.start_date }));
        if (logFilters.transactions) transactions.forEach(t => items.push({ ...t, log_type: 'Transaction', sort_date: t.created_at }));
        if (logFilters.holidays) holidays.forEach(h => items.push({ ...h, log_type: 'Holiday', sort_date: h.date || h.created_at }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (logFilters.deliveries) deliveryHistory.forEach((d: any) => items.push({ ...d, log_type: 'Delivery', sort_date: d.date || d.created_at }));
        return items.sort((a, b) => new Date(b.sort_date || 0).getTime() - new Date(a.sort_date || 0).getTime());
    }, [orders, transactions, holidays, deliveryHistory, logFilters]);

    // ====== Handlers ======
    const handleAddHoliday = async () => {
        if (!holidayStartDate) return;
        try {
            await addHolidayMutation.mutateAsync({ user_id: id, date: holidayStartDate, end_date: holidayEndDate || holidayStartDate });
            toast.success('Holiday added');
            setShowHolidayModal(false);
            setHolidayStartDate('');
            setHolidayEndDate('');
        } catch { toast.error('Failed to add holiday'); }
    };

    const handleDeleteHoliday = async () => {
        if (!deleteHoliday) return;
        try {
            await deleteHolidayMutation.mutateAsync({ id: deleteHoliday.id });
            toast.success('Holiday removed');
            setDeleteHoliday(null);
        } catch { toast.error('Failed to remove holiday'); }
    };

    const handleAddTransaction = async () => {
        if (!txnForm.amount) return;
        try {
            await addTxnMutation.mutateAsync({
                user_id: Number(id), amount: Number(txnForm.amount), type: Number(txnForm.type),
                description: txnForm.description, payment_id: 'xxx-admin',
            });
            toast.success('Transaction added');
            setShowTxnModal(false);
            setTxnForm({ amount: '', type: '1', description: '', payment_mode: '1' });
        } catch { toast.error('Failed to add transaction'); }
    };

    const handleRefund = async () => {
        if (!showRefundModal) return;
        try {
            await addTxnMutation.mutateAsync({
                user_id: showRefundModal.user_id, payment_id: showRefundModal.payment_id || '',
                amount: showRefundModal.amount, type: 1, description: 'Refund',
            });
            toast.success('Refund processed');
            setShowRefundModal(null);
        } catch { toast.error('Failed to process refund'); }
    };

    const handleSaveAddress = async () => {
        try {
            if (editAddress) {
                await updateAddressMutation.mutateAsync({ id: editAddress.id, user_id: Number(id), ...addrForm });
                toast.success('Address updated');
            } else {
                await addAddressMutation.mutateAsync({ user_id: Number(id), ...addrForm });
                toast.success('Address added');
            }
            setShowAddressModal(false);
            setEditAddress(null);
            setAddrForm({ name: '', s_phone: '', flat_no: '', apartment_name: '', area: '', landmark: '', city: '', pincode: '', lat: '', lng: '' });
        } catch { toast.error('Failed to save address'); }
    };

    const handleDeleteAddress = async () => {
        if (!deleteAddr) return;
        try {
            await deleteAddressMutation.mutateAsync({ id: deleteAddr.id });
            toast.success('Address deleted');
            setDeleteAddr(null);
        } catch { toast.error('Failed to delete address'); }
    };

    const openEditAddress = (a: Address) => {
        setEditAddress(a);
        setAddrForm({
            name: a.name || '', s_phone: a.s_phone || '', flat_no: a.flat_no || '',
            apartment_name: a.apartment_name || '', area: a.area || '', landmark: a.landmark || '',
            city: a.city || '', pincode: a.pincode || '', lat: a.lat || '', lng: a.lng || '',
        });
        setShowAddressModal(true);
    };

    // ====== Columns ======
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allActivityColumns: Column<any>[] = [
        {
            key: 'log_type', header: 'Log', width: '100px',
            render: (item) => {
                const colors: Record<string, string> = {
                    Order: 'bg-blue-500/20 text-blue-400', Transaction: 'bg-purple-500/20 text-purple-400',
                    Holiday: 'bg-orange-500/20 text-orange-400', Delivery: 'bg-green-500/20 text-green-400',
                };
                return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${colors[item.log_type] || ''}`}>{item.log_type}</span>;
            },
        },
        {
            key: 'sort_date', header: 'Date', width: '150px',
            render: (item) => {
                try { return <span className="text-sm">{format(new Date(item.sort_date), 'dd MMM yyyy HH:mm')}</span>; }
                catch { return <span>-</span>; }
            },
        },
        { key: 'id', header: 'ID', width: '70px' },
        {
            key: 'detail', header: 'Product / Description',
            render: (item) => <span className="text-sm text-slate-300">{item.title || item.description || item.product_title || '-'}</span>,
        },
        {
            key: 'amount_col', header: 'Amount', width: '100px',
            render: (item) => {
                const amt = item.order_amount || item.amount || item.final_amount;
                if (!amt) return <span>-</span>;
                if (item.log_type === 'Transaction') {
                    return <span className={item.type === 1 ? 'text-green-400' : 'text-red-400'}>₹{amt}</span>;
                }
                return <span className="text-emerald-400">₹{amt}</span>;
            },
        },
        { key: 'qty', header: 'Qty', width: '60px', render: (item) => <span>{item.qty || '-'}</span> },
        {
            key: 'sub_type', header: 'Sub Type', width: '120px',
            render: (item) => <span className="text-xs">{SUB_TYPE_LABELS[item.subscription_type] || '-'}</span>,
        },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderColumns: Column<any>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        { key: 'title', header: 'Product', render: (o) => <span>{o.title || o.product_title || '-'}</span> },
        { key: 'order_amount', header: 'Amount', render: (o) => <span className="text-emerald-400 font-semibold">₹{o.order_amount ?? o.final_amount ?? 0}</span> },
        { key: 'order_type', header: 'Type', render: (o) => ORDER_TYPE_LABELS[o.order_type] || '-' },
        { key: 'subscription_type', header: 'Sub Type', render: (o) => SUB_TYPE_LABELS[o.subscription_type || 0] || '-' },
        {
            key: 'status', header: 'Status',
            render: (o) => <span className={`px-2 py-1 rounded-lg text-xs font-medium ${o.order_status === 1 ? 'bg-green-500/20 text-green-400' : o.order_status === 2 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                {o.order_status === 1 ? 'Active' : o.order_status === 2 ? 'Stopped' : 'Pending'}
            </span>,
        },
        { key: 'created_at', header: 'Date', render: (o) => { try { return format(new Date(o.created_at), 'dd MMM yyyy'); } catch { return '-'; } } },
    ];

    const txnColumns: Column<UserTransaction>[] = [
        {
            key: 'refund', header: 'Refund', width: '70px',
            render: (t) => t.type === 2 ? (
                <button onClick={(e) => { e.stopPropagation(); setShowRefundModal(t); }}
                    className="p-1.5 hover:bg-green-500/20 rounded-lg text-green-400" title="Refund">
                    <RotateCcw className="w-4 h-4" />
                </button>
            ) : <span className="text-slate-700">-</span>,
        },
        { key: 'id', header: 'ID', width: '70px' },
        { key: 'order_id', header: 'Order', width: '70px', render: (t) => <span>{t.order_id || '-'}</span> },
        { key: 'payment_id', header: 'Payment ID', width: '130px', render: (t) => <span className="text-xs text-slate-400">{t.payment_id || '-'}</span> },
        { key: 'amount', header: 'Amount', render: (t) => <span className={t.type === 1 ? 'text-green-400' : 'text-red-400'}>₹{t.amount}</span> },
        { key: 'description', header: 'Description', render: (t) => <span className="text-slate-400 text-sm">{t.description || '-'}</span> },
        { key: 'pre_tx_wallet_balance', header: 'Wallet Prev', width: '100px', render: (t) => <span className="text-slate-500 text-sm">₹{t.pre_tx_wallet_balance ?? '-'}</span> },
        { key: 'updated_wallet_balance', header: 'Wallet Upd', width: '100px', render: (t) => <span className="text-slate-500 text-sm">₹{t.updated_wallet_balance ?? '-'}</span> },
        {
            key: 'type', header: 'Type', width: '90px',
            render: (t) => <span className={`px-2 py-1 rounded-lg text-xs font-medium ${t.type === 1 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{t.type === 1 ? 'Credit' : 'Debit'}</span>,
        },
        { key: 'updated_at', header: 'Date', render: (t) => { try { return format(new Date(t.updated_at || t.created_at), 'dd-MM-yyyy HH:mm:ss'); } catch { return '-'; } } },
    ];

    const holidayColumns: Column<UserHoliday>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        { key: 'date', header: 'Date', render: (h) => { try { return format(new Date(h.date), 'dd MMM yyyy'); } catch { return '-'; } } },
        { key: 'created_at', header: 'Added On', render: (h) => { try { return h.created_at ? format(new Date(h.created_at), 'dd MMM yyyy') : '-'; } catch { return '-'; } } },
        {
            key: 'id', header: 'Action', render: (h) => (
                <button onClick={(e) => { e.stopPropagation(); setDeleteHoliday(h); }} className="p-1.5 hover:bg-red-500/20 rounded-lg">
                    <Trash2 className="w-4 h-4 text-red-400" />
                </button>
            ),
        },
    ];

    const addressColumns: Column<Address>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        { key: 'name', header: 'Name' },
        { key: 's_phone', header: 'Phone', width: '120px' },
        {
            key: 'flat_no', header: 'Address',
            render: (a) => <span className="text-slate-400 text-sm">{[a.flat_no, a.apartment_name, a.area, a.city, a.pincode].filter(Boolean).join(', ')}</span>,
        },
        {
            key: 'actions', header: 'Actions', width: '100px',
            render: (a) => (
                <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); openEditAddress(a); }} className="p-1.5 hover:bg-slate-800/50 rounded-lg"><Edit className="w-4 h-4 text-blue-400" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteAddr(a); }} className="p-1.5 hover:bg-red-500/20 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
                </div>
            ),
        },
    ];

    if (isLoading) return <div className="space-y-6"><div className="h-8 w-32 bg-slate-800/50 rounded animate-pulse" /><div className="h-40 bg-slate-800/50 rounded-xl animate-pulse" /></div>;
    if (!user) return <div className="text-center py-20"><p className="text-slate-400">User not found</p><button onClick={() => router.push('/users')} className="mt-4 text-purple-400">Back to Users</button></div>;

    const walletAmt = user.wallet_amount || 0;
    const isLowWallet = walletAmt < 250;

    const tabs = [
        {
            label: 'All Activity', count: allActivity.length,
            content: (
                <div>
                    <div className="flex flex-wrap gap-3 mb-4">
                        {(['orders', 'transactions', 'holidays', 'deliveries'] as const).map(key => (
                            <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" checked={logFilters[key]}
                                    onChange={(e) => setLogFilters({ ...logFilters, [key]: e.target.checked })}
                                    className="rounded border-slate-600" />
                                {key.charAt(0).toUpperCase() + key.slice(1)}
                            </label>
                        ))}
                    </div>
                    <DataTable data={allActivity} columns={allActivityColumns} pageSize={25} searchPlaceholder="Search activity..." emptyMessage="No activity" />
                </div>
            ),
        },
        {
            label: 'Orders', count: orders.length,
            content: <DataTable data={orders} columns={orderColumns} pageSize={10} searchPlaceholder="Search orders..." emptyMessage="No orders" onRowClick={(o: Record<string, unknown>) => router.push(`/orders/${o.id}`)} />,
        },
        {
            label: 'Transactions', count: transactions.length,
            content: (
                <div>
                    <div className="flex justify-end mb-4">
                        <button onClick={() => setShowTxnModal(true)} className="flex items-center gap-2 px-3 py-2 bg-purple-600/20 text-purple-400 rounded-xl text-sm hover:bg-purple-600/30">
                            <Plus className="w-4 h-4" /> Add Transaction
                        </button>
                    </div>
                    <DataTable data={transactions} columns={txnColumns} pageSize={10} searchPlaceholder="Search transactions..." emptyMessage="No transactions" />
                </div>
            ),
        },
        {
            label: 'Holidays', count: holidays.length,
            content: (
                <div>
                    <div className="flex justify-end mb-4">
                        <button onClick={() => setShowHolidayModal(true)} className="flex items-center gap-2 px-3 py-2 bg-purple-600/20 text-purple-400 rounded-xl text-sm hover:bg-purple-600/30">
                            <Plus className="w-4 h-4" /> Add Holiday
                        </button>
                    </div>
                    <DataTable data={holidays} columns={holidayColumns} pageSize={10} emptyMessage="No holidays" />
                </div>
            ),
        },
        {
            label: 'Addresses', count: addresses.length,
            content: (
                <div>
                    <div className="flex justify-end mb-4">
                        <button onClick={() => { setEditAddress(null); setAddrForm({ name: '', s_phone: '', flat_no: '', apartment_name: '', area: '', landmark: '', city: '', pincode: '', lat: '', lng: '' }); setShowAddressModal(true); }}
                            className="flex items-center gap-2 px-3 py-2 bg-purple-600/20 text-purple-400 rounded-xl text-sm hover:bg-purple-600/30">
                            <Plus className="w-4 h-4" /> Add Address
                        </button>
                    </div>
                    <DataTable data={addresses} columns={addressColumns} pageSize={10} emptyMessage="No addresses" />
                </div>
            ),
        },
        {
            label: 'Delivery History', count: deliveryHistory.length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content: <DataTable data={deliveryHistory} columns={[
                { key: 'id', header: 'ID', width: '70px' },
                { key: 'date', header: 'Date', render: (d: Record<string, unknown>) => { try { return format(new Date(d.date as string), 'dd MMM yyyy'); } catch { return '-'; } } },
                { key: 'qty', header: 'Qty', render: (d: Record<string, unknown>) => String(d.qty || '-') },
                { key: 'order_id', header: 'Order', width: '70px' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as Column<any>[]} pageSize={10} emptyMessage="No delivery history" />,
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={() => router.push('/users')} className="p-2 hover:bg-slate-800/50 rounded-lg"><ArrowLeft className="w-5 h-5 text-slate-400" /></button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">{user.name}</h1>
                    <p className="text-slate-400">User #{user.id}</p>
                </div>
                <button onClick={() => router.push(`/users/${id}/edit`)} className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 rounded-xl hover:bg-purple-600/30"><Edit className="w-4 h-4" /> Edit</button>
                <button onClick={() => router.push(`/orders/new?user_id=${id}`)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl"><Plus className="w-4 h-4" /> New Order</button>
            </div>

            {/* User Info Card */}
            <div className="glass rounded-xl p-6">
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-white font-bold text-3xl">{user.name?.charAt(0).toUpperCase() || 'U'}</div>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center gap-3"><Mail className="w-4 h-4 text-slate-500" /><span className="text-slate-300">{user.email || '-'}</span></div>
                        <div className="flex items-center gap-3"><Phone className="w-4 h-4 text-slate-500" /><span className="text-slate-300">{user.phone || '-'}</span></div>
                        <div className="flex items-center gap-3">
                            <Wallet className={`w-4 h-4 ${isLowWallet ? 'text-red-400' : 'text-green-400'}`} />
                            <span className={`font-semibold text-lg ${isLowWallet ? 'text-red-400' : 'text-green-400'}`}>₹{walletAmt}</span>
                        </div>
                        <div className="flex items-center gap-3 md:col-span-2">
                            <MapPin className="w-4 h-4 text-slate-500" />
                            <span className="text-slate-400 text-sm">{user.address || [user.flat_no, user.apartment_name, user.area, user.city, user.pincode].filter(Boolean).join(', ') || '-'}</span>
                        </div>
                        <div>
                            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${user.status === 1 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{user.status === 1 ? 'Active' : 'Inactive'}</span>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-800/50">
                    <div className="text-center"><ShoppingCart className="w-5 h-5 text-purple-400 mx-auto mb-1" /><p className="text-xl font-bold text-white">{orders.length}</p><p className="text-xs text-slate-400">Orders</p></div>
                    <div className="text-center"><CreditCard className="w-5 h-5 text-blue-400 mx-auto mb-1" /><p className="text-xl font-bold text-white">{transactions.length}</p><p className="text-xs text-slate-400">Transactions</p></div>
                    <div className="text-center"><Calendar className="w-5 h-5 text-orange-400 mx-auto mb-1" /><p className="text-xl font-bold text-white">{holidays.length}</p><p className="text-xs text-slate-400">Holidays</p></div>
                    <div className="text-center"><MapPin className="w-5 h-5 text-pink-400 mx-auto mb-1" /><p className="text-xl font-bold text-white">{addresses.length}</p><p className="text-xs text-slate-400">Addresses</p></div>
                    <div className="text-center"><Truck className="w-5 h-5 text-green-400 mx-auto mb-1" /><p className="text-xl font-bold text-white">{deliveryHistory.length}</p><p className="text-xs text-slate-400">Deliveries</p></div>
                </div>
            </div>

            {/* Tabs */}
            <TabPanel tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

            {/* Holiday Modal */}
            <Modal isOpen={showHolidayModal} onClose={() => setShowHolidayModal(false)} title="Add Holiday">
                <div className="space-y-4">
                    <div><label className="block text-sm text-slate-300 mb-1">Start Date</label><input type="date" value={holidayStartDate} onChange={(e) => setHolidayStartDate(e.target.value)} className={inputClassName} /></div>
                    <div><label className="block text-sm text-slate-300 mb-1">End Date (optional)</label><input type="date" value={holidayEndDate} onChange={(e) => setHolidayEndDate(e.target.value)} min={holidayStartDate} className={inputClassName} /></div>
                    <div className="flex gap-3">
                        <button onClick={() => setShowHolidayModal(false)} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">Cancel</button>
                        <button onClick={handleAddHoliday} disabled={addHolidayMutation.isPending || !holidayStartDate} className="flex-1 px-4 py-2.5 text-sm text-white bg-purple-600 rounded-xl disabled:opacity-50">{addHolidayMutation.isPending ? 'Adding...' : 'Add Holiday'}</button>
                    </div>
                </div>
            </Modal>

            {/* Transaction Modal */}
            <Modal isOpen={showTxnModal} onClose={() => setShowTxnModal(false)} title="Add Transaction">
                <div className="space-y-4">
                    <div><label className="block text-sm text-slate-300 mb-1">Type</label><select value={txnForm.type} onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value })} className={selectClassName}><option value="1">Credit (Add Money)</option><option value="2">Debit (Deduct Money)</option></select></div>
                    <div><label className="block text-sm text-slate-300 mb-1">Amount (max ₹5000)</label><input type="number" value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} min={1} max={5000} className={inputClassName} /></div>
                    <div><label className="block text-sm text-slate-300 mb-1">Description</label><select value={txnForm.description} onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })} className={selectClassName}><option value="">Select...</option>{TXN_DESCRIPTIONS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                    {txnForm.type === '2' && user && Number(txnForm.amount) > walletAmt && <p className="text-red-400 text-xs">Exceeds wallet balance (₹{walletAmt})</p>}
                    <div className="flex gap-3">
                        <button onClick={() => setShowTxnModal(false)} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">Cancel</button>
                        <button onClick={handleAddTransaction} disabled={addTxnMutation.isPending} className="flex-1 px-4 py-2.5 text-sm text-white bg-purple-600 rounded-xl disabled:opacity-50">{addTxnMutation.isPending ? 'Adding...' : 'Add Transaction'}</button>
                    </div>
                </div>
            </Modal>

            {/* Refund Modal */}
            <Modal isOpen={!!showRefundModal} onClose={() => setShowRefundModal(null)} title="Process Refund">
                {showRefundModal && (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-400">Refund for transaction #{showRefundModal.id}</p>
                        <div><label className="block text-sm text-slate-300 mb-1">Amount</label><input type="number" value={showRefundModal.amount} disabled className={inputClassName} /></div>
                        <div><label className="block text-sm text-slate-300 mb-1">Type</label><input value="Credit (Refund)" disabled className={inputClassName} /></div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowRefundModal(null)} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">Cancel</button>
                            <button onClick={handleRefund} disabled={addTxnMutation.isPending} className="flex-1 px-4 py-2.5 text-sm text-white bg-green-600 rounded-xl disabled:opacity-50">{addTxnMutation.isPending ? 'Processing...' : 'Confirm Refund'}</button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Address Modal */}
            <Modal isOpen={showAddressModal} onClose={() => { setShowAddressModal(false); setEditAddress(null); }} title={editAddress ? 'Edit Address' : 'Add Address'}>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs text-slate-400 mb-1">Name *</label><input value={addrForm.name} onChange={(e) => setAddrForm({ ...addrForm, name: e.target.value })} className={inputClassName} placeholder="Name" /></div>
                        <div><label className="block text-xs text-slate-400 mb-1">Phone *</label><input value={addrForm.s_phone} onChange={(e) => setAddrForm({ ...addrForm, s_phone: e.target.value })} className={inputClassName} placeholder="Phone" /></div>
                        <div><label className="block text-xs text-slate-400 mb-1">Flat No *</label><input value={addrForm.flat_no} onChange={(e) => setAddrForm({ ...addrForm, flat_no: e.target.value })} className={inputClassName} placeholder="Flat / House No" /></div>
                        <div><label className="block text-xs text-slate-400 mb-1">Apartment *</label><input value={addrForm.apartment_name} onChange={(e) => setAddrForm({ ...addrForm, apartment_name: e.target.value })} className={inputClassName} placeholder="Apartment" /></div>
                        <div><label className="block text-xs text-slate-400 mb-1">Area *</label><input value={addrForm.area} onChange={(e) => setAddrForm({ ...addrForm, area: e.target.value })} className={inputClassName} placeholder="Area" /></div>
                        <div><label className="block text-xs text-slate-400 mb-1">Landmark</label><input value={addrForm.landmark} onChange={(e) => setAddrForm({ ...addrForm, landmark: e.target.value })} className={inputClassName} placeholder="Landmark" /></div>
                        <div><label className="block text-xs text-slate-400 mb-1">City *</label><input value={addrForm.city} onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })} className={inputClassName} placeholder="City" /></div>
                        <div><label className="block text-xs text-slate-400 mb-1">Pincode *</label><input value={addrForm.pincode} onChange={(e) => setAddrForm({ ...addrForm, pincode: e.target.value.replace(/\D/g, '').slice(0, 8) })} className={inputClassName} placeholder="Pincode" /></div>
                        <div><label className="block text-xs text-slate-400 mb-1">Latitude</label><input value={addrForm.lat} onChange={(e) => setAddrForm({ ...addrForm, lat: e.target.value })} className={inputClassName} placeholder="Latitude" /></div>
                        <div><label className="block text-xs text-slate-400 mb-1">Longitude</label><input value={addrForm.lng} onChange={(e) => setAddrForm({ ...addrForm, lng: e.target.value })} className={inputClassName} placeholder="Longitude" /></div>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => { setShowAddressModal(false); setEditAddress(null); }} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">Cancel</button>
                        <button onClick={handleSaveAddress} disabled={addAddressMutation.isPending || updateAddressMutation.isPending || !addrForm.name || !addrForm.flat_no}
                            className="flex-1 px-4 py-2.5 text-sm text-white bg-purple-600 rounded-xl disabled:opacity-50">
                            {(addAddressMutation.isPending || updateAddressMutation.isPending) ? 'Saving...' : 'Save Address'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirms */}
            <ConfirmDialog isOpen={!!deleteHoliday} title="Delete Holiday" message={`Remove holiday on ${deleteHoliday ? format(new Date(deleteHoliday.date), 'dd MMM yyyy') : ''}?`} onConfirm={handleDeleteHoliday} onCancel={() => setDeleteHoliday(null)} variant="danger" confirmText="Delete" isLoading={deleteHolidayMutation.isPending} />
            <ConfirmDialog isOpen={!!deleteAddr} title="Delete Address" message={`Delete address "${deleteAddr?.apartment_name || deleteAddr?.flat_no || ''}"?`} onConfirm={handleDeleteAddress} onCancel={() => setDeleteAddr(null)} variant="danger" confirmText="Delete" isLoading={deleteAddressMutation.isPending} />
        </div>
    );
}
