'use client';

import { useRouter } from 'next/navigation';
import { useUsers, User } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, User as UserIcon, Wallet, Phone, Mail } from 'lucide-react';

export default function UsersPage() {
    const router = useRouter();
    const { data: users = [], isLoading } = useUsers();

    const columns: Column<User>[] = [
        {
            key: 'id',
            header: 'ID',
            width: '80px',
        },
        {
            key: 'name',
            header: 'User',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {item.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                        <p className="font-medium text-white">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.email}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'phone',
            header: 'Phone',
            render: (item) => (
                <div className="flex items-center gap-2 text-slate-300">
                    <Phone className="w-4 h-4 text-slate-500" />
                    {item.phone || '-'}
                </div>
            ),
        },
        {
            key: 'wallet_amount',
            header: 'Wallet',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-green-400" />
                    <span className="font-semibold text-green-400">₹{item.wallet_amount || 0}</span>
                </div>
            ),
        },
        {
            key: 'address',
            header: 'Address',
            render: (item) => (
                <span className="text-slate-400 text-sm truncate max-w-[200px] block">
                    {item.address || '-'}
                </span>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (item) => {
                const isActive = item.status === 1;
                return (
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                        {isActive ? 'Active' : 'Inactive'}
                    </span>
                );
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Users</h1>
                    <p className="text-slate-400">Manage customer accounts</p>
                </div>
                <button
                    onClick={() => router.push('/users/new')}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
                >
                    <Plus className="w-5 h-5" />
                    Add User
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Users</p>
                    <p className="text-2xl font-bold text-white">{users.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Active</p>
                    <p className="text-2xl font-bold text-green-400">
                        {users.filter(u => u.status === 1).length}
                    </p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Wallet</p>
                    <p className="text-2xl font-bold text-emerald-400">
                        ₹{users.reduce((sum, u) => sum + (u.wallet_amount || 0), 0)}
                    </p>
                </div>
            </div>

            <DataTable
                data={users}
                columns={columns}
                loading={isLoading}
                pageSize={15}
                searchPlaceholder="Search users..."
                emptyMessage="No users found"
                onRowClick={(item) => router.push(`/users/${item.id}`)}
            />
        </div>
    );
}
