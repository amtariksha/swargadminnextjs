'use client';

import { TrendingUp, Users, Package, DollarSign } from 'lucide-react';

export default function PerformanceReportPage() {
    // Mock data - would come from API
    const stats = {
        totalOrders: 1245,
        totalUsers: 342,
        totalRevenue: 156780,
        averageOrderValue: 126,
        deliveryRate: 98.5,
        returnRate: 1.2,
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Performance Report</h1>
                <p className="text-slate-400">Overall business performance metrics</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                            <Package className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Total Orders</p>
                            <p className="text-2xl font-bold text-white">{stats.totalOrders.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="glass rounded-xl p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                            <Users className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Total Users</p>
                            <p className="text-2xl font-bold text-white">{stats.totalUsers}</p>
                        </div>
                    </div>
                </div>

                <div className="glass rounded-xl p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                            <DollarSign className="w-6 h-6 text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Total Revenue</p>
                            <p className="text-2xl font-bold text-green-400">₹{stats.totalRevenue.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="glass rounded-xl p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-orange-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Avg Order Value</p>
                            <p className="text-2xl font-bold text-white">₹{stats.averageOrderValue}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Delivery Performance</h2>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-slate-400">Delivery Success Rate</span>
                                <span className="text-green-400 font-semibold">{stats.deliveryRate}%</span>
                            </div>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full" style={{ width: `${stats.deliveryRate}%` }} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-slate-400">Return Rate</span>
                                <span className="text-red-400 font-semibold">{stats.returnRate}%</span>
                            </div>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full" style={{ width: `${stats.returnRate * 10}%` }} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="glass rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Quick Stats</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800/30 rounded-xl p-4 text-center">
                            <p className="text-3xl font-bold text-purple-400">24</p>
                            <p className="text-sm text-slate-400">Active Products</p>
                        </div>
                        <div className="bg-slate-800/30 rounded-xl p-4 text-center">
                            <p className="text-3xl font-bold text-blue-400">8</p>
                            <p className="text-sm text-slate-400">Active Drivers</p>
                        </div>
                        <div className="bg-slate-800/30 rounded-xl p-4 text-center">
                            <p className="text-3xl font-bold text-green-400">156</p>
                            <p className="text-sm text-slate-400">Orders Today</p>
                        </div>
                        <div className="bg-slate-800/30 rounded-xl p-4 text-center">
                            <p className="text-3xl font-bold text-orange-400">12</p>
                            <p className="text-sm text-slate-400">Pincodes Served</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
