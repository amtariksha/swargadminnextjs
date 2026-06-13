'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUsers, useDrivers, User } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, UserPlus, Users as UsersIcon } from 'lucide-react';

import { parseApiDate } from '@/lib/dateUtils';

// Sentinel filter values for the driver dropdown — distinct strings so they
// can't collide with a real driver user_id.
const DRIVER_FILTER_ALL = '__all__';
const DRIVER_FILTER_UNASSIGNED = '__unassigned__';

export default function UsersPage() {
    const router = useRouter();
    const { data: users = [], isLoading } = useUsers();
    const { data: drivers = [] } = useDrivers();
    const [driverFilter, setDriverFilter] = useState<string>(DRIVER_FILTER_ALL);
    const [sourceFilter, setSourceFilter] = useState<string>('all');

    // Rule-based source label: where the customer actually orders wins over
    // the signup channel; both → "App + Day".
    const sourceOf = (u: User): 'app' | 'day' | 'both' | 'web' | 'none' => {
        if (u.has_app_orders && u.has_day_orders) return 'both';
        if (u.has_day_orders) return 'day';
        if (u.has_app_orders) return 'app';
        if (u.channel_tag === 'website') return 'web';
        if (u.channel_tag === 'day') return 'day';
        return u.channel_tag === 'app' ? 'app' : 'none';
    };

    // Customers only (rows with no admin/driver role assignment).
    const customersOnly = useMemo(
        () => users.filter((user) => {
            const u = user as unknown as { role?: unknown[] };
            return !u.role || u.role.length === 0;
        }),
        [users],
    );

    // Apply the driver filter. "All" passes through; "Unassigned" keeps users
    // with no last_driver_id; a numeric pick keeps users whose MOST-RECENT
    // order assignment is that driver (matches the user-picked "currently
    // serving" semantic).
    const filteredUsers = useMemo(() => {
        let base = customersOnly;
        if (sourceFilter !== 'all') {
            base = base.filter((u) => {
                const s = sourceOf(u);
                return sourceFilter === 'day' ? (s === 'day' || s === 'both')
                    : sourceFilter === 'app' ? (s === 'app' || s === 'both')
                    : s === sourceFilter;
            });
        }
        if (driverFilter === DRIVER_FILTER_ALL) return base;
        if (driverFilter === DRIVER_FILTER_UNASSIGNED) {
            return base.filter((u) => u.last_driver_id == null);
        }
        const id = Number(driverFilter);
        return base.filter((u) => u.last_driver_id === id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customersOnly, driverFilter, sourceFilter]);

    // Newest customers first (by created date) for the table view.
    const sortedUsers = useMemo(
        () => [...filteredUsers].sort((a, b) => {
            const da = parseApiDate(a.created_at)?.getTime() ?? 0;
            const db = parseApiDate(b.created_at)?.getTime() ?? 0;
            return db - da;
        }),
        [filteredUsers],
    );

    // Look-up of driver_user_id → label, so the column can show the name
    // alongside the id without a per-row lookup.
    const driverLabelById = useMemo(() => {
        const m = new Map<number, string>();
        for (const d of drivers) {
            // d.user_id is users.id of the driver (see backend getUsersByRole).
            const label = d.role_label ? `${d.name} (${d.role_label})` : d.name;
            m.set(d.user_id, label);
        }
        return m;
    }, [drivers]);

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
            key: 'channel_tag',
            header: 'Source',
            width: '100px',
            render: (item) => {
                const s = sourceOf(item);
                const style: Record<string, { text: string; cls: string }> = {
                    app: { text: 'App', cls: 'bg-blue-500/20 text-blue-300' },
                    day: { text: 'Day', cls: 'bg-amber-500/20 text-amber-300' },
                    both: { text: 'App + Day', cls: 'bg-purple-500/20 text-purple-300' },
                    web: { text: 'Web', cls: 'bg-emerald-500/20 text-emerald-300' },
                    none: { text: '—', cls: 'text-slate-600' },
                };
                const v = style[s];
                return <span className={`text-xs px-2 py-0.5 rounded ${v.cls}`}>{v.text}</span>;
            },
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
            key: 'created_at',
            header: 'Created',
            width: '140px',
            render: (item) => {
                const d = parseApiDate(item.created_at);
                if (!d) return <span className="text-slate-500">-</span>;
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                return <span className="text-slate-400 text-sm">{`${dd}-${mm}-${yyyy}`}</span>;
            },
        },
        {
            key: 'first_order_date',
            header: 'First Order',
            width: '140px',
            render: (item) => {
                const d = parseApiDate(item.first_order_date);
                if (!d) return <span className="text-slate-500 text-sm">never</span>;
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                return <span className="text-slate-400 text-sm">{`${dd}-${mm}-${yyyy}`}</span>;
            },
        },
        {
            key: 'last_driver_id',
            header: 'Driver',
            width: '180px',
            render: (item) => {
                if (item.last_driver_id == null) {
                    return <span className="text-slate-500 text-sm">Unassigned</span>;
                }
                const label = driverLabelById.get(item.last_driver_id);
                return <span className="text-slate-300 text-sm">{label || `#${item.last_driver_id}`}</span>;
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
                        <p className="text-sm text-slate-400">Total Users (filtered)</p>
                        <p className="text-2xl font-bold text-white">{filteredUsers.length}</p>
                    </div>
                </div>
            </div>

            {/* Driver filter — narrows the customer list to those whose most-recent
                order is assigned to the chosen driver. "Unassigned" shows users
                with no order assignment at all. */}
            <div className="flex flex-col md:flex-row md:items-center gap-3">
                <label className="text-sm text-slate-400">Filter by driver:</label>
                <select
                    value={driverFilter}
                    onChange={(e) => setDriverFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm min-w-[260px] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                    <option value={DRIVER_FILTER_ALL}>All drivers ({customersOnly.length})</option>
                    <option value={DRIVER_FILTER_UNASSIGNED}>
                        Unassigned ({customersOnly.filter((u) => u.last_driver_id == null).length})
                    </option>
                    {drivers.map((d) => (
                        <option key={d.user_id} value={d.user_id}>
                            {d.role_label ? `${d.name} — ${d.role_label}` : d.name}
                        </option>
                    ))}
                </select>
                <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm min-w-[160px] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                    <option value="all">All sources</option>
                    <option value="app">App users</option>
                    <option value="day">Day-order users</option>
                    <option value="both">App + Day</option>
                    <option value="web">Web</option>
                </select>
            </div>

            <DataTable
                data={sortedUsers}
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
