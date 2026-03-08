'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useTransactions, useTransactionsByDateRange, Transaction } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import DateRangePicker from '@/components/DateRangePicker';
import { CreditCard, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function TransactionsPage() {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const hasDateRange = !!startDate && !!endDate;

    const { data: allTransactions = [], isLoading: allLoading } = useTransactions();
    const { data: rangeTransactions = [], isLoading: rangeLoading } = useTransactionsByDateRange(startDate, endDate);

    // Normalize UserTransaction[] to Transaction[] format for the DataTable
    const transactions: Transaction[] = hasDateRange
        ? rangeTransactions.map(t => ({
            id: t.id,
            user_id: t.user_id,
            amount: t.amount,
            type: t.type === 1 ? 'credit' : 'debit',
            payment_method: t.payment_mode === 1 ? 'online' : t.payment_mode === 2 ? 'cash' : undefined,
            status: 1,
            created_at: t.created_at,
        }))
        : allTransactions;
    const isLoading = hasDateRange ? rangeLoading : allLoading;

    const columns: Column<Transaction>[] = [
        { key: 'id', header: 'ID', width: '80px' },
        {
            key: 'user_name',
            header: 'User',
            render: (item) => <span className="font-medium text-white">{item.user_name || `User #${item.user_id}`}</span>,
        },
        {
            key: 'amount',
            header: 'Amount',
            render: (item) => {
                const isCredit = item.type === 'credit';
                return (
                    <div className="flex items-center gap-2">
                        {isCredit ? (
                            <ArrowUpRight className="w-4 h-4 text-green-400" />
                        ) : (
                            <ArrowDownRight className="w-4 h-4 text-red-400" />
                        )}
                        <span className={`font-semibold ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                            {isCredit ? '+' : '-'}₹{item.amount}
                        </span>
                    </div>
                );
            },
        },
        {
            key: 'type',
            header: 'Type',
            render: (item) => (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium capitalize ${item.type === 'credit' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                    {item.type}
                </span>
            ),
        },
        {
            key: 'payment_method',
            header: 'Method',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-300 capitalize">{item.payment_method || '-'}</span>
                </div>
            ),
        },
        {
            key: 'created_at',
            header: 'Date',
            render: (item) => (
                <span className="text-slate-400 text-sm">
                    {item.created_at ? format(new Date(item.created_at), 'dd MMM yyyy HH:mm') : '-'}
                </span>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (item) => (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${item.status === 1 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                    {item.status === 1 ? 'Completed' : 'Pending'}
                </span>
            ),
        },
    ];

    const totalCredit = transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
    const totalDebit = transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Transactions</h1>
                <p className="text-slate-400">View wallet transactions</p>
            </div>

            {/* Date Range Filter */}
            <div className="glass rounded-xl p-4">
                <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    onChange={(start, end) => {
                        setStartDate(start);
                        setEndDate(end);
                    }}
                />
                {hasDateRange && (
                    <button
                        onClick={() => { setStartDate(''); setEndDate(''); }}
                        className="mt-2 text-xs text-slate-400 hover:text-white"
                    >
                        Clear date filter
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Transactions</p>
                    <p className="text-2xl font-bold text-white">{transactions.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Credits</p>
                    <p className="text-2xl font-bold text-green-400">₹{totalCredit}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Debits</p>
                    <p className="text-2xl font-bold text-red-400">₹{totalDebit}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Net Balance</p>
                    <p className={`text-2xl font-bold ${totalCredit - totalDebit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ₹{(totalCredit - totalDebit).toLocaleString()}
                    </p>
                </div>
            </div>

            <DataTable data={transactions} columns={columns} loading={isLoading} pageSize={15} searchPlaceholder="Search transactions..." />
        </div>
    );
}
