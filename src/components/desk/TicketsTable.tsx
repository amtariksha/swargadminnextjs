'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import DataTable, { type Column } from '@/components/DataTable';
import { DeskClientError, EXPORT_MAX_ROWS } from '@/lib/desk/desk-query';
import { categoryLabel, deskHref, formatIstDateTime, formatWaiting } from '@/lib/desk/ticket-format';
import type { TicketListFilters } from '@/lib/desk/ticket-hooks';
import { RESOLUTION_CODE_LABEL, TICKET_STATUS_LABEL, deskErrorText } from '@/lib/desk/ticket-labels';
import { fetchAllTickets } from '@/lib/desk/ticket-mutations';
import { ticketsToCsv } from '@/lib/desk/tickets-csv';
import type { Category, TicketListItem } from '@/lib/desk/types';

interface TicketsTableProps {
    rows: TicketListItem[];
    bySlug: ReadonlyMap<string, Category>;
    loading: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    onLoadMore: () => void;
    /** The applied filters when the caller may export (managers); null hides the export button. */
    exportFilters: TicketListFilters | null;
}

function downloadCsv(csv: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

function buildColumns(bySlug: ReadonlyMap<string, Category>): Column<TicketListItem>[] {
    return [
        { key: 'ticket_no', header: '#', sortable: false, render: (row) => `#${row.ticket_no}` },
        { key: 'opened_at', header: 'Opened (IST)', sortable: false, render: (row) => formatIstDateTime(row.opened_at) },
        {
            key: 'customer_name', header: 'Customer', sortable: false,
            render: (row) => (
                <div>
                    <div className="text-white">{row.customer_name ?? 'Unknown'}</div>
                    <div className="text-xs text-slate-500">{row.customer_phone}</div>
                </div>
            ),
        },
        { key: 'integrated_number', header: 'Number', sortable: false, render: (row) => row.integrated_number ?? '—' },
        {
            key: 'category_slug', header: 'Category', sortable: false,
            render: (row) => row.category_slug !== null
                ? categoryLabel(row.category_slug, bySlug)
                : <span className="text-slate-500">{row.suggested_category !== null ? `Suggested: ${categoryLabel(row.suggested_category, bySlug)}` : 'Unclassified'}</span>,
        },
        {
            key: 'status', header: 'Status', sortable: false,
            render: (row) => <span className="rounded-md bg-slate-700/50 px-2 py-0.5 text-xs text-slate-200">{TICKET_STATUS_LABEL[row.status]}</span>,
        },
        {
            key: 'waiting_secs', header: 'Waiting', sortable: false,
            render: (row) => <span className={row.overdue ? 'text-red-400' : ''}>{formatWaiting(row.waiting_secs)}</span>,
        },
        { key: 'assigned_name', header: 'Assignee', sortable: false, render: (row) => row.assigned_name ?? '—' },
        {
            key: 'resolution_code', header: 'Resolution', sortable: false,
            render: (row) => row.resolution_code === null ? '—' : `${RESOLUTION_CODE_LABEL[row.resolution_code]} (${row.resolved_via ?? 'manual'})`,
        },
        { key: 'resolved_at', header: 'Resolved (IST)', sortable: false, render: (row) => row.resolved_at === null ? '—' : formatIstDateTime(row.resolved_at) },
        { key: 'area', header: 'Area', sortable: false, render: (row) => row.area ?? '—' },
    ];
}

export function TicketsTable({ rows, bySlug, loading, hasNextPage, isFetchingNextPage, onLoadMore, exportFilters }: TicketsTableProps) {
    const router = useRouter();
    const [exporting, setExporting] = useState(false);
    const columns = buildColumns(bySlug);

    const runExport = async (filters: TicketListFilters) => {
        setExporting(true);
        try {
            const { rows: all, capped } = await fetchAllTickets(filters, EXPORT_MAX_ROWS);
            downloadCsv(ticketsToCsv(all, bySlug), `desk-tickets-${filters.from ?? 'start'}_${filters.to ?? 'end'}.csv`);
            if (capped) toast.error('Export stopped at 5,000 rows. Narrow the range.');
        } catch (error: unknown) {
            const code = error instanceof DeskClientError ? error.code : 'internal_error';
            toast.error(deskErrorText(code, error instanceof Error ? error.message : 'Export failed'));
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-3">
            {exporting ? <p className="text-sm text-slate-400">Exporting…</p> : null}
            <DataTable<TicketListItem>
                data={rows}
                columns={columns}
                searchable={false}
                pageSize={50}
                loading={loading}
                emptyMessage="No tickets in this range"
                exportable={exportFilters !== null}
                onExport={() => { if (exportFilters !== null && !exporting) void runExport(exportFilters); }}
                onRowClick={(row) => router.push(deskHref(row.ticket_no, 'all'))}
            />
            {hasNextPage ? (
                <button
                    type="button"
                    disabled={isFetchingNextPage}
                    onClick={onLoadMore}
                    className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                    {isFetchingNextPage ? 'Loading…' : 'Load more'}
                </button>
            ) : null}
        </div>
    );
}
