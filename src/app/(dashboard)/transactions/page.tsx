'use client';

import { useState, useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { useTransactionsByDateRange, useUsers, useAddTransaction, type UserTransaction, type User } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { inputClassName, selectClassName } from '@/components/FormField';
import { CreditCard, Plus, RotateCcw, Download } from 'lucide-react';
import { toast } from 'sonner';

const TXN_DESCRIPTIONS = ['Cash Deposit', 'Recharge', 'Bank Transfer', 'Cheque Payment Via Payment Gateway', 'Refund', 'Referral Bonus'];

export default function TransactionsPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(today);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showRefundModal, setShowRefundModal] = useState<UserTransaction | null>(null);
    const [txnForm, setTxnForm] = useState({ user_id: '', payment_id: '', amount: '', type: '1', description: '' });

    const { data: transactions = [], isLoading, refetch } = useTransactionsByDateRange(startDate, endDate);
    const { data: users = [] } = useUsers();
    const addTxnMutation = useAddTransaction();

    const sortedTxns = useMemo(() =>
        [...transactions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        [transactions]
    );

    const totalCredit = sortedTxns.filter(t => t.type === 1).reduce((s, t) => s + t.amount, 0);
    const totalDebit = sortedTxns.filter(t => t.type === 2).reduce((s, t) => s + t.amount, 0);

    const handleAddTransaction = async () => {
        if (!txnForm.user_id || !txnForm.amount) return;
        try {
            await addTxnMutation.mutateAsync({
                user_id: Number(txnForm.user_id),
                payment_id: txnForm.payment_id || 'xxx-admin',
                amount: Number(txnForm.amount),
                type: Number(txnForm.type),
                description: txnForm.description,
            });
            toast.success('Transaction added');
            setShowAddModal(false);
            setTxnForm({ user_id: '', payment_id: '', amount: '', type: '1', description: '' });
            refetch();
        } catch { toast.error('Failed to add transaction'); }
    };

    const handleRefund = async () => {
        if (!showRefundModal) return;
        try {
            await addTxnMutation.mutateAsync({
                user_id: showRefundModal.user_id,
                payment_id: showRefundModal.payment_id || '',
                amount: showRefundModal.amount,
                type: 1, // Credit
                description: 'Refund',
            });
            toast.success('Refund processed');
            setShowRefundModal(null);
            refetch();
        } catch { toast.error('Failed to process refund'); }
    };

    const handleExport = () => {
        const headers = ['ID', 'Order ID', 'Payment ID', 'Amount', 'Name', 'Phone', 'Description', 'Wallet Prev', 'Wallet Upd', 'Type', 'Date'];
        const rows = sortedTxns.map(t => [
            t.id, t.order_id || '', t.payment_id || '', t.amount,
            t.name || '', t.phone || '', t.description || '',
            t.pre_tx_wallet_balance ?? '', t.updated_wallet_balance ?? '',
            t.type === 1 ? 'Credit' : 'Debit',
            t.updated_at || t.created_at
        ]);
        const csv = [headers, ...rows.map(r => r.map(c => `"${c}"`))].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${today.replace(/-/g, '')}_Transaction.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const columns: Column<UserTransaction>[] = [
        {
            key: 'refund', header: 'Refund', width: '80px',
            render: (t) => t.type === 2 ? (
                <button onClick={(e) => { e.stopPropagation(); setShowRefundModal(t); }}
                    className="p-1.5 hover:bg-green-500/20 rounded-lg text-green-400" title="Refund">
                    <RotateCcw className="w-4 h-4" />
                </button>
            ) : <span className="text-slate-600">-</span>,
        },
        { key: 'id', header: 'ID', width: '70px' },
        { key: 'order_id', header: 'Order ID', width: '80px', render: (t) => <span>{t.order_id || '-'}</span> },
        { key: 'payment_id', header: 'Payment ID', width: '150px', render: (t) => <span className="text-xs text-slate-400">{t.payment_id || '-'}</span> },
        {
            key: 'amount', header: 'Amount', width: '100px',
            render: (t) => <span className={`font-semibold ${t.type === 1 ? 'text-green-400' : 'text-red-400'}`}>₹{t.amount}</span>,
        },
        { key: 'name', header: 'Name', width: '150px', render: (t) => <span>{t.name || '-'}</span> },
        { key: 'phone', header: 'Phone', width: '120px', render: (t) => <span className="text-slate-400">{t.phone || '-'}</span> },
        { key: 'description', header: 'Description', width: '180px', render: (t) => <span className="text-sm text-slate-400">{t.description || '-'}</span> },
        {
            key: 'pre_tx_wallet_balance', header: 'Wallet Prev', width: '100px',
            render: (t) => <span className="text-slate-400 text-sm">₹{t.pre_tx_wallet_balance ?? '-'}</span>,
        },
        {
            key: 'updated_wallet_balance', header: 'Wallet Upd', width: '100px',
            render: (t) => <span className="text-slate-400 text-sm">₹{t.updated_wallet_balance ?? '-'}</span>,
        },
        {
            key: 'type', header: 'Type', width: '90px',
            render: (t) => (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${t.type === 1 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {t.type === 1 ? 'Credit' : 'Debit'}
                </span>
            ),
        },
        {
            key: 'updated_at', header: 'Date', width: '160px',
            render: (t) => {
                const d = t.updated_at || t.created_at;
                try { return <span className="text-slate-400 text-sm">{format(new Date(d), 'dd-MM-yyyy HH:mm:ss')}</span>; }
                catch { return <span>-</span>; }
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Transactions</h1>
                    <p className="text-slate-400">View and manage wallet transactions</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                    <span className="text-slate-500">to</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                    <button onClick={handleExport} disabled={sortedTxns.length === 0}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white disabled:opacity-40">
                        <Download className="w-4 h-4" /> Export
                    </button>
                    <button onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                        <Plus className="w-4 h-4" /> Add Transaction
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Transactions</p>
                    <p className="text-2xl font-bold text-white">{sortedTxns.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Credits</p>
                    <p className="text-2xl font-bold text-green-400">₹{totalCredit.toLocaleString()}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Debits</p>
                    <p className="text-2xl font-bold text-red-400">₹{totalDebit.toLocaleString()}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Net Balance</p>
                    <p className={`text-2xl font-bold ${totalCredit - totalDebit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ₹{(totalCredit - totalDebit).toLocaleString()}
                    </p>
                </div>
            </div>

            <DataTable data={sortedTxns} columns={columns} loading={isLoading} pageSize={100} searchPlaceholder="Search transactions..." />

            {/* Add Transaction Modal */}
            <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Transaction">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">User</label>
                        <select value={txnForm.user_id} onChange={(e) => setTxnForm({ ...txnForm, user_id: e.target.value })} className={selectClassName}>
                            <option value="">Select user...</option>
                            {users.map((u: User) => <option key={u.id} value={u.id}>{u.id} - {u.name} ({u.phone})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Payment ID (optional)</label>
                        <input value={txnForm.payment_id} onChange={(e) => setTxnForm({ ...txnForm, payment_id: e.target.value })} className={inputClassName} placeholder="Payment reference" />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Amount (max ₹5000)</label>
                        <input type="number" value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })}
                            min={1} max={5000} className={inputClassName} placeholder="Enter amount" />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Type</label>
                        <select value={txnForm.type} onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value })} className={selectClassName}>
                            <option value="1">Credit (Add Money)</option>
                            <option value="2">Debit (Deduct Money)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Description</label>
                        <select value={txnForm.description} onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })} className={selectClassName}>
                            <option value="">Select description...</option>
                            {TXN_DESCRIPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">Cancel</button>
                        <button onClick={handleAddTransaction} disabled={addTxnMutation.isPending || !txnForm.user_id || !txnForm.amount}
                            className="flex-1 px-4 py-2.5 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-xl disabled:opacity-50">
                            {addTxnMutation.isPending ? 'Adding...' : 'Add Transaction'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Refund Modal */}
            <Modal isOpen={!!showRefundModal} onClose={() => setShowRefundModal(null)} title="Process Refund">
                {showRefundModal && (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-400">Refund for transaction #{showRefundModal.id} — {showRefundModal.name}</p>
                        <div>
                            <label className="block text-sm text-slate-300 mb-1">Amount</label>
                            <input type="number" value={showRefundModal.amount} disabled className={inputClassName} />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-300 mb-1">Type</label>
                            <input value="Credit (Refund)" disabled className={inputClassName} />
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowRefundModal(null)} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">Cancel</button>
                            <button onClick={handleRefund} disabled={addTxnMutation.isPending}
                                className="flex-1 px-4 py-2.5 text-sm text-white bg-green-600 hover:bg-green-700 rounded-xl disabled:opacity-50">
                                {addTxnMutation.isPending ? 'Processing...' : 'Confirm Refund'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
