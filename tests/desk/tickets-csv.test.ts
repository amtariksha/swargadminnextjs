/** P3b CSV export (spec table 8.9). */

import { describe, it, expect } from 'vitest';
import { TICKET_CSV_HEADERS, csvCell, ticketsToCsv } from '@/lib/desk/tickets-csv';
import type { Category, TicketListItem } from '@/lib/desk/types';

const MAP: ReadonlyMap<string, Category> = new Map([['spam', { slug: 'spam', label: 'Spam' } as Category]]);

describe('csvCell', () => {
    it.each([
        ['ravi', '"ravi"'],
        ['a "b"', '"a ""b"""'],
        ['=HYPERLINK("x")', '"\'=HYPERLINK(""x"")"'],
        ['+919876543210', '"\'+919876543210"'],
        ['-5', '"\'-5"'],
        ['@me', '"\'@me"'],
        ['919876543210', '"919876543210"'],
        [42, '"42"'],
        [null, '""'],
        [undefined, '""'],
        ['line1\nline2', '"line1\nline2"'],
    ])('csvCell(%j) is %j', (value, expected) => {
        expect(csvCell(value)).toBe(expected);
    });
});

describe('ticketsToCsv', () => {
    it('has 28 columns', () => {
        expect(TICKET_CSV_HEADERS).toHaveLength(28);
    });
    it('writes only a BOM and a header for no rows', () => {
        const csv = ticketsToCsv([], MAP);
        expect(csv.startsWith('﻿"Ticket","Opened (IST)"')).toBe(true);
        expect(csv.split('\r\n')).toHaveLength(1);
    });
    it('writes one line per row, joined with CRLF', () => {
        const row = {
            ticket_no: 41, opened_at: '2026-10-11T23:40:00.000Z', category_slug: 'spam', waiting_secs: 125,
            overdue: true, resolved_at: null, customer_name: '=cmd', first_response_at: null,
        } as unknown as TicketListItem;
        const lines = ticketsToCsv([row], MAP).split('\r\n');
        expect(lines).toHaveLength(2);
        expect(lines[1].startsWith('"41","12 Oct 2026, 05:10"')).toBe(true);
        expect(lines[1]).toContain('"Spam"');
        expect(lines[1]).toContain('"2"');
        expect(lines[1]).toContain('"yes"');
        expect(lines[1]).toContain('"\'=cmd"');
        expect(lines[1].split('","')).toHaveLength(28);
    });
});
