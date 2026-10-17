'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import DataTable, { type Column } from '@/components/DataTable';
import { formatIst, humanise } from '@/components/desk/reports/format';
import { useCategoryTickets } from '@/hooks/useDeskReports';
import type { Queue } from '@/lib/desk/constants';
import type { IstDate, TicketListItem } from '@/lib/desk/types';

const COLUMNS: Column<TicketListItem>[] = [
    {
        key: 'ticket_no',
        header: 'Ticket',
        sortable: true,
        render: (item) => (
            <Link href={`/desk?ticket=${item.ticket_no}`} className="text-purple-300 underline">#{item.ticket_no}</Link>
        ),
    },
    { key: 'customer_name', header: 'Customer', render: (item) => item.customer_name ?? item.customer_phone ?? 'Not recorded' },
    { key: 'status', header: 'Status', render: (item) => humanise(item.status) },
    { key: 'opened_at', header: 'Opened (IST)', sortable: true, render: (item) => formatIst(item.opened_at) },
    { key: 'driver_name', header: 'Driver', render: (item) => item.driver_name ?? 'Not recorded' },
    { key: 'product_name', header: 'Product', render: (item) => item.product_name ?? 'Not recorded' },
    { key: 'resolution_code', header: 'Resolution', render: (item) => (item.resolution_code ? humanise(item.resolution_code) : '—') },
];

interface Props {
    from: IstDate;
    to: IstDate;
    queue: Queue | null;
    slug: string;
    label: string;
    onClose: () => void;
}

export function CategoryDrilldownModal({ from, to, queue, slug, label, onClose }: Props) {
    const { data, isLoading } = useCategoryTickets(from, to, slug, queue);
    const items = data?.ok ? data.data.items : [];
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="glass flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-slate-800 p-4">
                    <h2 className="text-lg font-semibold text-white">{label} — tickets</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="overflow-y-auto p-4">
                    {data && !data.ok ? <p className="text-sm text-red-300">{data.error.message}</p> : null}
                    <DataTable
                        data={items}
                        columns={COLUMNS}
                        loading={isLoading}
                        pageSize={50}
                        exportable={false}
                        searchPlaceholder="Search tickets..."
                        emptyMessage="No tickets in this category"
                    />
                </div>
            </div>
        </div>
    );
}
