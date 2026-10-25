/**
 * Unit tests for src/components/pulse/shopOutstandingExport.ts — the CSV /
 * date helpers behind Business Pulse → Shop Outstanding.
 *
 * Run with: npm run test:units
 */

import { describe, it, expect } from 'vitest';
import { ddmmyyyy, shopOutstandingCsv } from '@/components/pulse/shopOutstandingExport';
import type { ShopOutstandingRow } from '@/hooks/usePulse';

const row = (s_no: number, name: string, balance: number): ShopOutstandingRow => ({
    s_no, user_id: s_no, name, balance, opening: 0, ledger_balance: balance, opening_date: null, is_shop: true,
});

describe('ddmmyyyy', () => {
    it('renders the sheet date format', () => {
        expect(ddmmyyyy('2026-10-24')).toBe('24-10-2026');
        expect(ddmmyyyy('2026-10-24T00:00:00')).toBe('24-10-2026');
    });

    it('passes through anything that is not a date', () => {
        expect(ddmmyyyy('')).toBe('');
    });
});

describe('shopOutstandingCsv', () => {
    it('matches the sheet: S.No, Shop Name, amount as of the date, then the total', () => {
        const csv = shopOutstandingCsv(
            [row(1, 'Adrish', 5127), row(2, 'Bharathish (Distributor)', 77583)], 82710, '2026-10-24');
        expect(csv.split('\n')).toEqual([
            'S.No,Shop Name,Outstanding as of 24-10-2026',
            '1,Adrish,5127.00',
            '2,Bharathish (Distributor),77583.00',
            ',Total Outstanding,82710.00',
        ]);
    });

    it('quotes names containing commas or quotes', () => {
        const csv = shopOutstandingCsv([row(1, 'Goodness, "Organic"', 0)], 0, '2026-10-24');
        expect(csv.split('\n')[1]).toBe('1,"Goodness, ""Organic""",0.00');
    });

    it('keeps a shop in credit negative', () => {
        expect(shopOutstandingCsv([row(1, 'X', -150.5)], -150.5, '2026-10-24').split('\n')[1]).toBe('1,X,-150.50');
    });
});
