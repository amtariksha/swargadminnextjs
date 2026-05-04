'use client';

import { useRouter } from 'next/navigation';
import { useUsers, User } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, UserPlus, Users as UsersIcon } from 'lucide-react';

import { parseApiDate } from '@/lib/dateUtils';
export default function UsersPage() {
    const router = useRouter();
    const { data: users = [], isLoading } = useUsers();

    // Filter to users without roles (same as React admin)
    const filteredUsers = users.filter((user) => {
        const u = user as unknown as { role?: unknown[] };
        return !u.role || u.role.length === 0;
    });

    const newUsersLast7Days = filteredUsers.filter(u => {
        const d = parseApiDate(u.created_at);
        if (!d) return false;
        return d.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
    }).length;

    const columns: Column<User>[] = [
        {
            key: 'view',
            header: 'View',
            width: '80px',
            render: (item) => (
                <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/users/${item.id}`); }}
                    className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-xs font-medium"
                >
                    View
                </button>
            ),
        },
        {
            key: 'update',
            header: 'Update',
            width: '80px',
            render: (item) => (
                <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/users/${item.id}/edit`); }}
                    className="px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 text-xs font-medium"
                >
                    Edit
                </button>
            ),
        },
        {
            key: 'id',
            header: 'ID',
            width: '60px',
        },
        {
            key: 'image',
            header: 'Image',
            width: '80px',
            render: (item) => (
                item.image ? (
                    <img src={item.image} alt={item.name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                        {item.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                )
            ),
        },
        {
            key: 'name',
            header: 'Name',
            width: '180px',
        },
        {
            key: 'email',
            header: 'Email',
            width: '250px',
            render: (item) => (
                <span className="text-slate-300">{item.email || '-'}</span>
            ),
        },
        {
            key: 'phone',
            header: 'Phone',
            width: '150px',
            render: (item) => (
                <span className="text-slate-300">{item.phone || '-'}</span>
            ),
        },
        {
            key: 'wallet_amount',
            header: 'Wallet Amount',
            width: '120px',
            render: (item) => {
                const amount = item.wallet_amount ?? 0;
                const isLow = amount === null || amount < 250;
                return (
                    <span className={`font-bold ${isLow ? 'text-red-400' : 'text-green-400'}`}>
                        {amount}
                    </span>
                );
            },
        },
        {
            key: 'updated_at',
            header: 'Last Update',
            width: '200px',
            render: (item) => {
                const d = parseApiDate(item.updated_at);
                if (!d) return <span className="text-slate-500">-</span>;
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                const hh = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                const ss = String(d.getSeconds()).padStart(2, '0');
                return <span className="text-slate-400 text-sm">{`${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`}</span>;
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Users</h1>
                    <p className="text-slate-400">Manage Users</p>
                </div>
                <button
                    onClick={() => router.push('/users/new')}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
                >
                    <Plus className="w-5 h-5" />
                    Add New
                </button>
            </div>

            {/* Stats - matches React admin: 2 cards */}
            <div className="grid grid-cols-2 gap-4">
                <div className="glass rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                        <UserPlus className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">New registrations in last 1 week</p>
                        <p className="text-2xl font-bold text-white">{newUsersLast7Days}</p>
                    </div>
                </div>
                <div className="glass rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                        <UsersIcon className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Total Users</p>
                        <p className="text-2xl font-bold text-white">{filteredUsers.length}</p>
                    </div>
                </div>
            </div>

            <DataTable
                data={filteredUsers}
                columns={columns}
                loading={isLoading}
                pageSize={50}
                searchPlaceholder="Search"
                emptyMessage="No users found"
                onRowClick={(item) => router.push(`/users/${item.id}`)}
            />
        </div>
    );
}
