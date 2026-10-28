import { describe, expect, it } from 'vitest';
import {
    type ShopInvoice, type ShopStop, shopBillLabel, summariseShopDay, tallyBadge,
} from '@/lib/shopBilling';

const invoice = (over: Partial<ShopInvoice> = {}, tally: Partial<ShopInvoice['tally']> = {}): ShopInvoice => ({
    id: 1,
    invoice_number: 'SF/0001',
    total_amount: 100,
    cancelled: false,
    ...over,
    tally: { status: 'confirmed', error: null, next_attempt_at: null, ...tally },
});

const shop = (over: Partial<ShopStop> = {}): ShopStop => ({
    b2b_user_id: 7,
    drop_point_id: 3,
    title: 'Iskcon',
    customer_name: 'Iskcon',
    customer_phone: null,
    route_order: 1,
    truck_driver_name: null,
    moved_to_day: false,
    status: 3,
    products: [{
        pre_delivery_id: 501, order_id: 1, product_title: 'Milk', qty_text: '1 L',
        delivered_qty: 10, reason: null, status: 3, invoice: null,
    }],
    billing_cycle: 0,
    invoices: [],
    unbilled: 0,
    ...over,
});

describe('tallyBadge', () => {
    it('names each Tally state', () => {
        expect(tallyBadge(invoice(), true).label).toBe('In Tally');
        expect(tallyBadge(invoice({}, { status: 'merged' }), true).label).toBe('In Tally (day voucher)');
        expect(tallyBadge(invoice({}, { status: null }), true).label).toBe('Not queued');
    });

    it('shows why a voucher failed', () => {
        const badge = tallyBadge(invoice({}, { status: 'failed', error: 'Ledger missing' }), true);
        expect(badge.label).toBe('Tally failed');
        expect(badge.title).toBe('Ledger missing');
    });

    it('a queued voucher reads as posting off when Tally posting is off', () => {
        expect(tallyBadge(invoice({}, { status: 'pending' }), true).label).toBe('Tally queued');
        expect(tallyBadge(invoice({}, { status: 'pending' }), false).label).toBe('Tally posting off');
    });
});

describe('shopBillLabel', () => {
    it('accounting off means no bills', () => {
        expect(shopBillLabel(shop(), false).label).toBe('Accounting off — no bills');
    });

    it('per delivery: counts delivered lines without a bill', () => {
        expect(shopBillLabel(shop({ unbilled: 2 }), true).label).toBe('2 delivered lines not billed');
        expect(shopBillLabel(shop({ unbilled: 1 }), true).label).toBe('1 delivered line not billed');
        expect(shopBillLabel(shop(), true).label).toBe('Billed');
    });

    it('per delivery with nothing delivered yet', () => {
        const pending = shop({ status: 1, products: [{ ...shop().products[0], status: 1 }] });
        expect(shopBillLabel(pending, true).label).toBe('Nothing delivered yet');
    });

    it('monthly and day-pooled shops are billed elsewhere', () => {
        expect(shopBillLabel(shop({ billing_cycle: 1 }), true).label).toBe('Monthly — billed after the month ends');
        expect(shopBillLabel(shop({ billing_cycle: 1, invoices: [invoice()] }), true).label).toBe('Monthly bill made');
        expect(shopBillLabel(shop({ moved_to_day: true }), true).label).toBe('Bills when the day driver delivers');
    });
});

describe('summariseShopDay', () => {
    it('counts each invoice once and leaves cancelled ones out', () => {
        const shared = invoice({ id: 9, total_amount: 900 });
        const summary = summariseShopDay([
            shop({ invoices: [invoice({ id: 1, total_amount: 100 }), shared], unbilled: 1 }),
            shop({ b2b_user_id: 8, status: 1, invoices: [shared, invoice({ id: 2, total_amount: 50 }, { status: 'pending' })] }),
            shop({ b2b_user_id: 9, invoices: [invoice({ id: 3, cancelled: true }), invoice({ id: 4, total_amount: 20 }, { status: 'failed' })] }),
        ]);
        expect(summary).toEqual({
            shops: 3,
            done: 2,
            invoices: 4,
            billedAmount: 1070,
            unbilled: 1,
            inTally: 2,
            tallyQueued: 1,
            tallyFailed: 1,
        });
    });
});
