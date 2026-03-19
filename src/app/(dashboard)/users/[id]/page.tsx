'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { format } from 'date-fns';
import {
    useUser,
    useUserOrders,
    useUserTransactions,
    useUserHolidays,
    useUserAddresses,
    useUserDeliveryHistory,
    useAddHoliday,
    useDeleteHoliday,
    useAddTransaction,
    type UserTransaction,
    type UserHoliday,
    type Address,
} from '@/hooks/useData';
import { Order } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import TabPanel from '@/components/TabPanel';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { inputClassName, selectClassName } from '@/components/FormField';
import {
    ArrowLeft,
    Edit,
    Plus,
    Phone,
    Mail,
    MapPin,
    Wallet,
    ShoppingCart,
    Calendar,
    Truck,
    CreditCard,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

const ORDER_TYPE_LABELS: Record<number, string> = { 1: 'Prepaid', 2: 'Postpaid', 3: 'Pay Now', 4: 'Pay Later' };
const SUB_TYPE_LABELS: Record<number, string> = { 1: 'One Time', 2: 'Weekly', 3: 'Daily', 4: 'Alternative' };

export default function UserDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState(0);
    const [showHolidayModal, setShowHolidayModal] = useState(false);
    const [showTxnModal, setShowTxnModal] = useState(false);
    const [deleteHoliday, setDeleteHoliday] = useState<UserHoliday | null>(null);
    const [holidayStartDate, setHolidayStartDate] = useState('');
    const [holidayEndDate, setHolidayEndDate] = useState('');
    const [txnForm, setTxnForm] = useState({ amount: '', type: '1', description: '', payment_mode: '1' });

    const TXN_DESCRIPTION_PRESETS = ['Cash Deposit', 'Recharge', 'Bank Transfer', 'Cheque Payment Via Payment Gateway', 'Refund', 'Referral Bonus'];

    const { data: user, isLoading } = useUser(id);
    const { data: orders = [] } = useUserOrders(id);
    const { data: transactions = [] } = useUserTransactions(id);
    const { data: holidays = [] } = useUserHolidays(id);
    const { data: addresses = [] } = useUserAddresses(id);
    const { data: deliveryHistory = [] } = useUserDeliveryHistory(id);

    const addHolidayMutation = useAddHoliday();
    const deleteHolidayMutation = useDeleteHoliday();
    const addTxnMutation = useAddTransaction();

    const handleAddHoliday = async () => {
        if (!holidayStartDate) return;
        try {
            await addHolidayMutation.mutateAsync({
                user_id: id,
                date: holidayStartDate,
                end_date: holidayEndDate || holidayStartDate,
            });
            toast.success('Holiday added');
            setShowHolidayModal(false);
            setHolidayStartDate('');
            setHolidayEndDate('');
        } catch {
            toast.error('Failed to add holiday');
        }
    };

    const handleDeleteHoliday = async () => {
        if (!deleteHoliday) return;
        try {
            await deleteHolidayMutation.mutateAsync({ id: deleteHoliday.id });
            toast.success('Holiday removed');
            setDeleteHoliday(null);
        } catch {
            toast.error('Failed to remove holiday');
        }
    };

    const handleAddTransaction = async () => {
        if (!txnForm.amount) return;
        try {
            await addTxnMutation.mutateAsync({
                user_id: Number(id),
                amount: Number(txnForm.amount),
                type: Number(txnForm.type),
                description: txnForm.description,
                payment_mode: Number(txnForm.payment_mode),
                payment_id: 'xxx-admin',
            });
            toast.success('Transaction added');
            setShowTxnModal(false);
            setTxnForm({ amount: '', type: '1', description: '', payment_mode: '1' });
        } catch {
            toast.error('Failed to add transaction');
        }
    };

    const orderColumns: Column<Order>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        { key: 'product_title', header: 'Product' },
        {
            key: 'final_amount', header: 'Amount',
            render: (o) => <span className="text-emerald-400 font-semibold">₹{o.final_amount}</span>,
        },
        {
            key: 'order_type', header: 'Type',
            render: (o) => ORDER_TYPE_LABELS[o.order_type] || '-',
        },
        {
            key: 'subscription_type', header: 'Sub Type',
            render: (o) => SUB_TYPE_LABELS[o.subscription_type || 0] || '-',
        },
        {
            key: 'status', header: 'Status',
            render: (o) => (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${o.status === 1 ? 'bg-green-500/20 text-green-400' : o.status === 2 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {o.status === 1 ? 'Confirmed' : o.status === 2 ? 'Cancelled' : 'Pending'}
                </span>
            ),
        },
        { key: 'created_at', header: 'Date', render: (o) => format(new Date(o.created_at), 'dd MMM yyyy') },
    ];

    const txnColumns: Column<UserTransaction>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        {
            key: 'type', header: 'Type',
            render: (t) => (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${t.type === 1 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {t.type === 1 ? 'Credit' : 'Debit'}
                </span>
            ),
        },
        {
            key: 'amount', header: 'Amount',
            render: (t) => (
                <span className={t.type === 1 ? 'text-green-400' : 'text-red-400'}>
                    {t.type === 1 ? '+' : '-'}₹{t.amount}
                </span>
            ),
        },
        { key: 'description', header: 'Description', render: (t) => <span className="text-slate-400 text-sm">{t.description || '-'}</span> },
        { key: 'payment_mode', header: 'Mode', render: (t) => t.payment_mode === 1 ? 'Online' : t.payment_mode === 2 ? 'Cash' : '-' },
        { key: 'created_at', header: 'Date', render: (t) => format(new Date(t.created_at), 'dd MMM yyyy HH:mm') },
    ];

    const holidayColumns: Column<UserHoliday>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        { key: 'date', header: 'Date', render: (h) => format(new Date(h.date), 'dd MMM yyyy') },
        { key: 'created_at', header: 'Added On', render: (h) => h.created_at ? format(new Date(h.created_at), 'dd MMM yyyy') : '-' },
        {
            key: 'id', header: 'Action',
            render: (h) => (
                <button onClick={(e) => { e.stopPropagation(); setDeleteHoliday(h); }} className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4 text-red-400" />
                </button>
            ),
        },
    ];

    const addressColumns: Column<Address>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        { key: 'name', header: 'Name' },
        { key: 's_phone', header: 'Phone' },
        {
            key: 'flat_no', header: 'Address',
            render: (a) => (
                <span className="text-slate-400 text-sm">
                    {[a.flat_no, a.apartment_name, a.area, a.city, a.pincode].filter(Boolean).join(', ')}
                </span>
            ),
        },
    ];

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-32 bg-slate-800/50 rounded animate-pulse" />
                <div className="h-40 bg-slate-800/50 rounded-xl animate-pulse" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="text-center py-20">
                <p className="text-slate-400">User not found</p>
                <button onClick={() => router.push('/users')} className="mt-4 text-purple-400 hover:text-purple-300">
                    Back to Users
                </button>
            </div>
        );
    }

    const tabs = [
        {
            label: 'Orders',
            count: orders.length,
            content: (
                <DataTable data={orders} columns={orderColumns} pageSize={10} searchPlaceholder="Search orders..." emptyMessage="No orders" onRowClick={(o) => router.push(`/orders/${o.id}`)} />
            ),
        },
        {
            label: 'Transactions',
            count: transactions.length,
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
            label: 'Holidays',
            count: holidays.length,
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
            label: 'Addresses',
            count: addresses.length,
            content: <DataTable data={addresses} columns={addressColumns} pageSize={10} emptyMessage="No addresses" />,
        },
        {
            label: 'Delivery History',
            count: deliveryHistory.length,
            content: <DataTable data={deliveryHistory} columns={[
                { key: 'id', header: 'ID', width: '70px' },
                { key: 'date', header: 'Date', render: (d) => {
                    return d.date ? format(new Date(d.date), 'dd MMM yyyy') : '-';
                }},
                { key: 'qty', header: 'Qty', render: (d) => String(d.qty || '-') },
                { key: 'order_id', header: 'Order', width: '70px' },
            ]} pageSize={10} emptyMessage="No delivery history" />,
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={() => router.push('/users')} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">{user.name}</h1>
                    <p className="text-slate-400">User #{user.id}</p>
                </div>
                <button
                    onClick={() => router.push(`/users/${id}/edit`)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 rounded-xl hover:bg-purple-600/30"
                >
                    <Edit className="w-4 h-4" /> Edit
                </button>
                <button
                    onClick={() => router.push(`/orders/new?user_id=${id}`)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600"
                >
                    <Plus className="w-4 h-4" /> New Order
                </button>
            </div>

            {/* User Info Card */}
            <div className="glass rounded-xl p-6">
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-white font-bold text-3xl">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center gap-3">
                            <Mail className="w-4 h-4 text-slate-500" />
                            <span className="text-slate-300">{user.email || '-'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Phone className="w-4 h-4 text-slate-500" />
                            <span className="text-slate-300">{user.phone || '-'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            {(() => {
                                const amt = user.wallet_amount || 0;
                                const isLow = amt < 250;
                                return <>
                                    <Wallet className={`w-4 h-4 ${isLow ? 'text-red-400' : 'text-green-400'}`} />
                                    <span className={`font-semibold text-lg ${isLow ? 'text-red-400' : 'text-green-400'}`}>₹{amt}</span>
                                </>;
                            })()}
                        </div>
                        <div className="flex items-center gap-3 md:col-span-2">
                            <MapPin className="w-4 h-4 text-slate-500" />
                            <span className="text-slate-400 text-sm">
                                {user.address || [user.flat_no, user.apartment_name, user.area, user.city, user.pincode].filter(Boolean).join(', ') || '-'}
                            </span>
                        </div>
                        <div>
                            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${user.status === 1 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {user.status === 1 ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-800/50">
                    <div className="text-center">
                        <ShoppingCart className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-white">{orders.length}</p>
                        <p className="text-xs text-slate-400">Orders</p>
                    </div>
                    <div className="text-center">
                        <CreditCard className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-white">{transactions.length}</p>
                        <p className="text-xs text-slate-400">Transactions</p>
                    </div>
                    <div className="text-center">
                        <Calendar className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-white">{holidays.length}</p>
                        <p className="text-xs text-slate-400">Holidays</p>
                    </div>
                    <div className="text-center">
                        <MapPin className="w-5 h-5 text-pink-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-white">{addresses.length}</p>
                        <p className="text-xs text-slate-400">Addresses</p>
                    </div>
                    <div className="text-center">
                        <Truck className="w-5 h-5 text-green-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-white">{deliveryHistory.length}</p>
                        <p className="text-xs text-slate-400">Deliveries</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <TabPanel tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

            {/* Add Holiday Modal */}
            <Modal isOpen={showHolidayModal} onClose={() => setShowHolidayModal(false)} title="Add Holiday">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Start Date</label>
                        <input type="date" value={holidayStartDate} onChange={(e) => setHolidayStartDate(e.target.value)} className={inputClassName} />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">End Date (optional — defaults to start date)</label>
                        <input type="date" value={holidayEndDate} onChange={(e) => setHolidayEndDate(e.target.value)} min={holidayStartDate} className={inputClassName} />
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setShowHolidayModal(false)} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">Cancel</button>
                        <button onClick={handleAddHoliday} disabled={addHolidayMutation.isPending || !holidayStartDate} className="flex-1 px-4 py-2.5 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-xl disabled:opacity-50">
                            {addHolidayMutation.isPending ? 'Adding...' : 'Add Holiday'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Add Transaction Modal */}
            <Modal isOpen={showTxnModal} onClose={() => setShowTxnModal(false)} title="Add Transaction">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Type</label>
                        <select value={txnForm.type} onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value })} className={selectClassName}>
                            <option value="1">Credit (Add Money)</option>
                            <option value="2">Debit (Deduct Money)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Amount</label>
                        <input type="number" placeholder="Enter amount" value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} className={inputClassName} />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Payment Mode</label>
                        <select value={txnForm.payment_mode} onChange={(e) => setTxnForm({ ...txnForm, payment_mode: e.target.value })} className={selectClassName}>
                            <option value="1">Online</option>
                            <option value="2">Cash</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Description</label>
                        <select value={txnForm.description} onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })} className={selectClassName}>
                            <option value="">Select description...</option>
                            {TXN_DESCRIPTION_PRESETS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    {txnForm.type === '2' && user && Number(txnForm.amount) > (user.wallet_amount || 0) && (
                        <p className="text-red-400 text-xs">Debit amount exceeds wallet balance (₹{user.wallet_amount || 0})</p>
                    )}
                    <div className="flex gap-3">
                        <button onClick={() => setShowTxnModal(false)} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">Cancel</button>
                        <button onClick={handleAddTransaction} disabled={addTxnMutation.isPending} className="flex-1 px-4 py-2.5 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-xl disabled:opacity-50">
                            {addTxnMutation.isPending ? 'Adding...' : 'Add Transaction'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete Holiday Confirm */}
            <ConfirmDialog
                isOpen={!!deleteHoliday}
                title="Delete Holiday"
                message={`Remove holiday on ${deleteHoliday ? format(new Date(deleteHoliday.date), 'dd MMM yyyy') : ''}?`}
                onConfirm={handleDeleteHoliday}
                onCancel={() => setDeleteHoliday(null)}
                variant="danger"
                confirmText="Delete"
                isLoading={deleteHolidayMutation.isPending}
            />
        </div>
    );
}
