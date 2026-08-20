/**
 * Unit tests for the stall POS pure helpers (src/lib/stall/types.ts).
 *
 * The cart total shown at the till is a PREVIEW — the backend re-prices every
 * line from stall_menu_item and its number is the one charged. These pin the
 * preview arithmetic so the two agree, because a till that shows ₹199.99 while
 * the receipt says ₹200 is a conversation with a customer nobody wants.
 */

import { describe, it, expect } from 'vitest';
import { cartSubtotal, isSettled, type CartLine } from '@/lib/stall/types';

const line = (unitPrice: number, qty: number): CartLine => ({
    menuItemId: 1, label: 'x', sizeText: null, unitPrice, qty,
});

describe('cartSubtotal', () => {
    it('sums quantity x unit price', () => {
        expect(cartSubtotal([line(100, 2), line(40, 1)])).toBe(240);
    });

    it('is zero for an empty cart', () => {
        expect(cartSubtotal([])).toBe(0);
    });

    it('rounds to paise rather than accumulating float error', () => {
        // 33.33 x 3 is 99.99000000000001 in IEEE754.
        expect(cartSubtotal([line(33.33, 3)])).toBe(99.99);
        expect(cartSubtotal([line(0.1, 3)])).toBe(0.3);
    });

    it('matches the backend line_total = round2(qty * unit_price) shape', () => {
        // Same inputs as tests/stallPricing.test.js on the backend.
        expect(cartSubtotal([line(100, 2)])).toBe(200);
        expect(cartSubtotal([line(130, 1), line(250, 1), line(40, 2)])).toBe(460);
    });
});

describe('isSettled', () => {
    it('recognises every settled state the backend writes', () => {
        // Mirrors PAID_STATES in daytimePaymentController. UPI settles as
        // 'paid' with payment_mode='upi', so there is no 'upi' status.
        expect(isSettled('paid')).toBe(true);
        expect(isSettled('cash')).toBe(true);
        expect(isSettled('wallet_deducted')).toBe(true);
    });

    it('treats unpaid and link_sent as NOT settled', () => {
        expect(isSettled('unpaid')).toBe(false);
        expect(isSettled('link_sent')).toBe(false);
    });

    it('is safe on missing values rather than throwing at a counter', () => {
        expect(isSettled(null)).toBe(false);
        expect(isSettled(undefined)).toBe(false);
        expect(isSettled('')).toBe(false);
    });
});
