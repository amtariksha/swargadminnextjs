'use client';

import { useRouter } from 'next/navigation';
import { useUsers } from '@/hooks/useData';
import { useOrders } from '@/hooks/useOrders';
import {
    Users,
    ShoppingCart,
    Wallet,
    TruckIcon,
    ArrowRight,
    Package,
    CalendarCheck,
    AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';

export default function DashboardPage() {
    const router = useRouter();
    const { data: users = [], isLoading: usersLoading } = useUsers();
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data: todayOrders = [], isLoading: ordersLoading } = useOrders(today);

    const isLoading = usersLoading || ordersLoading;

    const activeUsers = users.filter((u) => u.status === 1).length;
    const totalWallet = users.reduce((sum, u) => sum + (u.wallet_amount || 0), 0);
    const lowWalletUsers = users.filter((u) => (u.wallet_amount || 0) < 100).length;
    const pendingOrders = todayOrders.filter((o) => o.order_status === 0 || o.status === 0).length;
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.final_amount || 0), 0);

    const stats = [
        {
            label: 'Total Users',
            value: users.length,
            icon: Users,
            color: 'text-blue-400',
            bg: 'from-blue-500/20 to-blue-600/10',
        },
        {
            label: 'Active Users',
            value: activeUsers,
            icon: Users,
            color: 'text-green-400',
            bg: 'from-green-500/20 to-green-600/10',
        },
        {
            label: "Today's Orders",
            value: todayOrders.length,
            icon: ShoppingCart,
            color: 'text-purple-400',
            bg: 'from-purple-500/20 to-purple-600/10',
        },
        {
            label: "Today's Revenue",
            value: `₹${todayRevenue.toLocaleString()}`,
            icon: Wallet,
            color: 'text-emerald-400',
            bg: 'from-emerald-500/20 to-emerald-600/10',
        },
        {
            label: 'Total Wallet Balance',
            value: `₹${totalWallet.toLocaleString()}`,
            icon: Wallet,
            color: 'text-cyan-400',
            bg: 'from-cyan-500/20 to-cyan-600/10',
        },
        {
            label: 'Pending Deliveries',
            value: pendingOrders,
            icon: TruckIcon,
            color: 'text-orange-400',
            bg: 'from-orange-500/20 to-orange-600/10',
        },
        {
            label: 'Low Wallet Users',
            value: lowWalletUsers,
            icon: AlertTriangle,
            color: 'text-red-400',
            bg: 'from-red-500/20 to-red-600/10',
        },
    ];

    const quickActions = [
        { label: 'Delivery List', href: '/delivery-list', icon: TruckIcon },
        { label: 'Users', href: '/users', icon: Users },
        { label: 'Orders', href: '/orders', icon: ShoppingCart },
        { label: 'Packing List', href: '/packing-list', icon: Package },
        { label: 'Calendar', href: '/calendar', icon: CalendarCheck },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                <p className="text-slate-400">Overview of your business</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map((stat) => (
                    <div key={stat.label} className={`glass rounded-xl p-4 bg-gradient-to-br ${stat.bg}`}>
                        <div className="flex items-center justify-between mb-2">
                            <stat.icon className={`w-5 h-5 ${stat.color}`} />
                        </div>
                        <p className="text-sm text-slate-400">{stat.label}</p>
                        {isLoading ? (
                            <div className="h-8 bg-slate-800/50 rounded animate-pulse mt-1" />
                        ) : (
                            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                        )}
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="glass rounded-xl p-4">
                <h2 className="text-lg font-semibold text-white mb-3">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {quickActions.map((action) => (
                        <button
                            key={action.label}
                            onClick={() => router.push(action.href)}
                            className="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-slate-800/50 rounded-xl transition-colors group"
                        >
                            <action.icon className="w-5 h-5 text-purple-400" />
                            <span className="text-sm text-slate-300 group-hover:text-white">{action.label}</span>
                            <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 ml-auto" />
                        </button>
                    ))}
                </div>
            </div>

            {/* Recent Orders */}
            <div className="glass rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Today&apos;s Orders</h2>
                    <button
                        onClick={() => router.push('/orders')}
                        className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    >
                        View All <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
                {ordersLoading ? (
                    <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-14 bg-slate-800/50 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : todayOrders.length === 0 ? (
                    <p className="text-slate-500 text-sm py-8 text-center">No orders today</p>
                ) : (
                    <div className="space-y-2">
                        {todayOrders.slice(0, 10).map((order) => (
                            <div
                                key={order.id}
                                onClick={() => router.push(`/orders/${order.id}`)}
                                className="flex items-center justify-between p-3 bg-slate-900/30 hover:bg-slate-800/30 rounded-xl cursor-pointer transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                                        <Package className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-white">
                                            #{order.id} - {order.product_title}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {order.user_name || 'Unknown'} &middot; {order.user_phone || ''}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-emerald-400">
                                        ₹{order.final_amount}
                                    </p>
                                    <span
                                        className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                                            order.status === 1
                                                ? 'bg-green-500/20 text-green-400'
                                                : order.status === 2
                                                ? 'bg-red-500/20 text-red-400'
                                                : 'bg-yellow-500/20 text-yellow-400'
                                        }`}
                                    >
                                        {order.status === 1 ? 'Confirmed' : order.status === 2 ? 'Cancelled' : 'Pending'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
