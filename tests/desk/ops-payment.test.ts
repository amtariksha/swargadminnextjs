import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ticketActionBody } from '@/lib/desk/contracts';
import { buildDayOrderBody, isStaffMatch } from '@/lib/desk/ops-actions';
import { isOrderAlreadyPaid, readOrderPaymentState, stepFromOrderState } from '@/lib/desk/ops-payment';

const read = (path: string) => readFileSync(path, 'utf8');
const state = (status: string, mode: string | null = null, linkId: string | null = null) => ({ status, mode, linkId });

describe('payment reconcile (review M2)', () => {
    it('R1 only the backend code daytime_order_paid counts as already paid', () => {
        expect(isOrderAlreadyPaid({ code: 'daytime_order_paid', status: 422 })).toBe(true);
        expect(isOrderAlreadyPaid({ code: 'validation_failed' })).toBe(false);
        expect(isOrderAlreadyPaid(new Error('daytime_order_paid'))).toBe(false);
        expect(isOrderAlreadyPaid(null)).toBe(false);
    });
    it('R2 reads the order body and rejects anything else', () => {
        expect(readOrderPaymentState({ data: { payment_status: 'cash', payment_mode: 'cash', payment_link_id: null } })).toEqual(state('cash', 'cash'));
        expect(readOrderPaymentState({ data: { payment_status: 'link_sent', payment_link_id: 'plink_1' } })).toEqual(state('link_sent', null, 'plink_1'));
        expect(readOrderPaymentState({ data: {} })).toBeNull();
        expect(readOrderPaymentState({ data: { payment_status: '  ' } })).toBeNull();
        expect(readOrderPaymentState([])).toBeNull();
        expect(readOrderPaymentState(undefined)).toBeNull();
    });
    it('R3 maps the real state to the step that actually happened', () => {
        expect(stepFromOrderState(state('cash', 'cash'))).toMatchObject({ payment_step: 'marked_paid', payment_status: 'cash', payment_mode: 'cash' });
        expect(stepFromOrderState(state('wallet_deducted'))).toMatchObject({ payment_step: 'marked_paid', payment_status: 'wallet_deducted', payment_mode: 'wallet' });
        expect(stepFromOrderState(state('paid', 'upi', 'plink_old'))).toMatchObject({ payment_step: 'marked_paid', payment_status: 'paid', payment_mode: 'upi', payment_link_id: null });
        expect(stepFromOrderState(state('paid', 'razorpay', 'plink_2'))).toEqual({
            payment_step: 'link_sent', payment_status: 'paid', payment_mode: 'link', payment_link_id: 'plink_2',
        });
        expect(stepFromOrderState(state('link_sent', null, 'plink_3'))).toMatchObject({ payment_step: 'link_sent', payment_link_id: 'plink_3' });
    });
    it('R4 a state that proves no step maps to null (never a guessed step)', () => {
        expect(stepFromOrderState(state('unpaid'))).toBeNull();
        expect(stepFromOrderState(state('link_sent'))).toBeNull();
        expect(stepFromOrderState(state('paid', 'razorpay'))).toBeNull();
        expect(stepFromOrderState(state('refunded'))).toBeNull();
    });
    it('R5 every reconciled step still builds a body the contract accepts', () => {
        const common = { client_action_id: '3f2b8c1e-5d4a-4b6e-9c2d-7a1e0f3b5c6d', seen_inbound_at: null };
        for (const reconciled of [state('cash', 'cash'), state('wallet_deducted'), state('paid', 'upi'), state('paid', 'x', 'plink_2'), state('link_sent', null, 'plink_3')]) {
            const step = stepFromOrderState(reconciled);
            expect(step).not.toBeNull();
            if (step === null) continue;
            const body = buildDayOrderBody(common, { resolve: false }, { orderId: 9, total: 120, deliveryDate: '2026-10-29', step, newCustomer: false });
            expect(ticketActionBody.safeParse(body).success).toBe(true);
        }
    });
});

describe('staff match', () => {
    it('S1 flags only the staff kind', () => {
        expect(isStaffMatch({ match: { kind: 'staff' } } as never)).toBe(true);
        expect(isStaffMatch({ match: { kind: 'none' } } as never)).toBe(false);
        expect(isStaffMatch({ match: { kind: 'candidates', candidates: [] } } as never)).toBe(false);
    });
});

// The components cannot be rendered in this node-only suite, so the structural rules of the review fixes are pinned by source.
describe('drawer structure (review H1, M1, L1)', () => {
    const dir = 'src/components/desk/actions';
    const drawer = read(`${dir}/DayOrderDrawer.tsx`);

    it('H1 the seen token is read from ctx only inside the open click handlers, never when a drawer mounts', () => {
        const reads = drawer.match(/ctx\.seenInboundAt/g) ?? [];
        expect(reads).toHaveLength(2);
        for (const line of drawer.split('\n').filter((item) => item.includes('ctx.seenInboundAt'))) {
            expect(line).toMatch(/setSession\(/);
        }
        expect(drawer).not.toMatch(/useState\(\(\) => ctx\.seenInboundAt\)/);
    });
    it('M1 the dispatcher has no early return, so an open drawer is never unmounted by row state', () => {
        const actions = read(`${dir}/OpsActions.tsx`);
        expect(actions).not.toMatch(/return null;\s*\n\s*switch/);
        expect(actions).not.toMatch(/if \(.*\) return null/);
        expect(read(`${dir}/MarkNotDeliveredForm.tsx`)).not.toMatch(/if \(nowMs === 0/);
    });
    it('L1 every trigger takes `offer` and no flow is gated on it', () => {
        for (const name of ['DayOrderDrawer', 'HolidayForm', 'MarkNotDeliveredForm', 'LinkCustomerButton', 'PaymentLinkButton']) {
            expect(read(`${dir}/${name}.tsx`)).toMatch(/offer/);
        }
        expect(read(`${dir}/HolidayForm.tsx`)).not.toMatch(/availability === 'staff'\) return null/);
    });
});
