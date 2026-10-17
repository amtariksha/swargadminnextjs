// Pure: the CSV export of the ticket list. Customer names come from WhatsApp profiles, so a cell that
// starts like a spreadsheet formula is prefixed with an apostrophe.

import { categoryLabel, formatIstDateTime } from './ticket-format';
import type { Category, TicketListItem } from './types';

const FORMULA_START = /^[=+\-@\t\r]/;
const BOM = '﻿';

export const TICKET_CSV_HEADERS = [
    'Ticket', 'Opened (IST)', 'Customer', 'Phone', 'Number', 'Queue', 'Type', 'Category',
    'Suggested category', 'Status', 'Assignee', 'Waiting (min)', 'Overdue', 'First response (IST)',
    'Resolved (IST)', 'Resolution', 'Resolved via', 'Resolved by', 'Reopens', 'Area', 'Apartment',
    'Pincode', 'Driver', 'Product', 'Delivery date', 'Order value', 'Payment status', 'Origin',
] as const;

export function csvCell(value: unknown): string {
    if (value === null || value === undefined) return '""';
    const text = String(value);
    const safe = FORMULA_START.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
}

const istCell = (iso: string | null): string => (iso === null ? '' : formatIstDateTime(iso));

function rowCells(row: TicketListItem, bySlug: ReadonlyMap<string, Category>): unknown[] {
    return [
        row.ticket_no, istCell(row.opened_at), row.customer_name, row.customer_phone, row.integrated_number,
        row.queue, row.type, categoryLabel(row.category_slug, bySlug), row.suggested_category, row.status,
        row.assigned_name, row.waiting_secs === null ? null : Math.floor(row.waiting_secs / 60),
        row.overdue ? 'yes' : 'no', istCell(row.first_response_at), istCell(row.resolved_at),
        row.resolution_code, row.resolved_via, row.resolved_by_name, row.reopen_count, row.area,
        row.apartment_name, row.pincode, row.driver_name, row.product_name, row.delivery_date,
        row.order_value, row.payment_status, row.origin,
    ];
}

export function ticketsToCsv(rows: readonly TicketListItem[], bySlug: ReadonlyMap<string, Category>): string {
    const header = TICKET_CSV_HEADERS.map(csvCell).join(',');
    const lines = rows.map((row) => rowCells(row, bySlug).map(csvCell).join(','));
    return BOM + [header, ...lines].join('\r\n');
}
