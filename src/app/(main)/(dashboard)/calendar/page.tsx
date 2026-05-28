'use client';

import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { useCalendarOrders, CalendarOrder } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import { ChevronLeft, ChevronRight, Calendar, Package, Wallet } from 'lucide-react';

export default function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());

    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    const { data: orders = [], isLoading } = useCalendarOrders(formattedDate);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Calculate total for selected date
    const totalAmount = orders.reduce((sum, order) => sum + (order.final_amount || 0), 0);
    const totalQty = orders.reduce((sum, order) => sum + (order.qty || 0), 0);

    const columns: Column<CalendarOrder>[] = [
        {
            key: 'id',
            header: 'Order ID',
            width: '100px',
            render: (item) => (
                <span className="font-mono text-purple-400">#{item.id}</span>
            ),
        },
        {
            key: 'product_title',
            header: 'Product',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                        <Package className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="font-medium text-white">{item.product_title}</span>
                </div>
            ),
        },
        {
            key: 'qty',
            header: 'Qty',
            width: '80px',
            render: (item) => (
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium">
                    {item.qty}
                </span>
            ),
        },
        {
            key: 'user_name',
            header: 'Customer',
            render: (item) => item.user_name || '-',
        },
        {
            key: 'final_amount',
            header: 'Amount',
            render: (item) => (
                <span className="font-semibold text-green-400">₹{item.final_amount}</span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Calendar</h1>
                    <p className="text-slate-400">View orders by date</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Calendar */}
                <div className="glass rounded-2xl p-4">
                    {/* Month navigation */}
                    <div className="flex items-center justify-between mb-4">
                        <button
                            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                            className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-400" />
                        </button>
                        <h3 className="text-lg font-semibold text-white">
                            {format(currentDate, 'MMMM yyyy')}
                        </h3>
                        <button
                            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                            className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
                        >
                            <ChevronRight className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                            <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {/* Empty cells for days before month start */}
                        {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-square" />
                        ))}

                        {days.map((day) => {
                            const isSelected = isSameDay(day, selectedDate);
                            const isToday = isSameDay(day, new Date());

                            return (
                                <button
                                    key={day.toISOString()}
                                    onClick={() => setSelectedDate(day)}
                                    className={`
                                        aspect-square rounded-lg text-sm font-medium transition-all
                                        ${isSelected
                                            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                                            : isToday
                                                ? 'bg-purple-500/20 text-purple-400'
                                                : 'text-slate-300 hover:bg-slate-800/50'
                                        }
                                    `}
                                >
                                    {format(day, 'd')}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Orders for selected date */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Stats for selected date */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-slate-400">
                            <Calendar className="w-5 h-5" />
                            <span className="font-medium text-white">
                                {format(selectedDate, 'dd MMMM yyyy')}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="glass rounded-xl p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                    <Package className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-400">Total Orders</p>
                                    <p className="text-xl font-bold text-white">{orders.length}</p>
                                </div>
                            </div>
                        </div>
                        <div className="glass rounded-xl p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                                    <Wallet className="w-5 h-5 text-green-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-400">Total Amount</p>
                                    <p className="text-xl font-bold text-green-400">₹{totalAmount}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DataTable
                        data={orders}
                        columns={columns}
                        loading={isLoading}
                        pageSize={10}
                        searchPlaceholder="Search orders..."
                        emptyMessage="No orders for this date"
                        exportable={false}
                    />
                </div>
            </div>
        </div>
    );
}
