'use client';

import { useOrders, Order } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import { format, addDays } from 'date-fns';
import { Package, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function UpcomingOrdersPage() {
    const router = useRouter();
    // Get orders for next 7 days
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const { data: orders = [], isLoading } = useOrders(tomorrow);

    const columns: Column<Order>[] = [
        { key: 'id', header: 'ID', width: '80px', render: (item) => <span className="font-mono text-purple-400">#{item.id}</span> },
        {
            key: 'product_title',
            header: 'Product',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="font-medium text-white">{item.product_title}</span>
                </div>
            ),
        },
        { key: 'user_name', header: 'Customer', render: (item) => item.user_name || '-' },
        { key: 'quantity', header: 'Qty', render: (item) => <span className="font-semibold">{item.quantity}</span> },
        {
            key: 'delivery_date',
            header: 'Delivery Date',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span>{item.delivery_date ? format(new Date(item.delivery_date), 'dd MMM yyyy') : '-'}</span>
                </div>
            ),
        },
        {
            key: 'final_amount',
            header: 'Amount',
            render: (item) => <span className="font-semibold text-green-400">₹{item.final_amount}</span>,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Upcoming Orders</h1>
                <p className="text-slate-400">Orders scheduled for future delivery</p>
            </div>

            <DataTable
                data={orders}
                columns={columns}
                loading={isLoading}
                pageSize={15}
                searchPlaceholder="Search orders..."
                onRowClick={(item) => router.push(`/orders/${item.id}`)}
            />
        </div>
    );
}
