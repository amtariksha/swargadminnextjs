import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { ticketActionBody } from '@/lib/desk/contracts';
import { buildDayOrderBody, isStaffMatch } from '@/lib/desk/ops-actions';
import {
    isIndeterminateError, isOrderAlreadyPaid, paymentDrawerClosable, readOrderPaymentState, stepFromOrderState,
    type PaymentDrawerFlags,
} from '@/lib/desk/ops-payment';

const read = (path: string) => readFileSync(path, 'utf8');
const apiError = (status: number, code?: string) =>
    new ApiError({ status, code, userMessage: 'x', requestId: 'r', envelope: {} });
const state = (status: string, mode: string | null = null, linkId: string | null = null) => ({ status, mode, linkId });

describe('payment reconcile (review M2)', () => {
    it('R1 only the backend code daytime_order_paid counts as already paid', () => {
        expect(isOrderAlreadyPaid(apiError(422, 'daytime_order_paid'))).toBe(true);
        expect(isOrderAlreadyPaid(apiError(422, 'validation_failed'))).toBe(false);
        expect(isOrderAlreadyPaid(apiError(500))).toBe(false);
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
        expect(stepFromOrderState(state('paid'))).toBeNull();
        // a stale link id behind another payment mode is not a link payment
        expect(stepFromOrderState(state('paid', 'wallet', 'plink_old'))).toBeNull();
        expect(stepFromOrderState(state('paid', 'cash', 'plink_old'))).toBeNull();
        expect(stepFromOrderState(state('refunded'))).toBeNull();
    });
    it('R5 every reconciled step still builds a body the contract accepts', () => {
        const common = { client_action_id: '3f2b8c1e-5d4a-4b6e-9c2d-7a1e0f3b5c6d', seen_inbound_at: null };
        for (const reconciled of [state('cash', 'cash'), state('wallet_deducted'), state('paid', 'upi'), state('paid', 'link', 'plink_2'), state('link_sent', null, 'plink_3')]) {
            const step = stepFromOrderState(reconciled);
            expect(step).not.toBeNull();
            if (step === null) continue;
            const body = buildDayOrderBody(common, { resolve: false }, { orderId: 9, total: 120, deliveryDate: '2026-10-29', step, newCustomer: false });
            expect(ticketActionBody.safeParse(body).success).toBe(true);
        }
    });
});

describe('lost responses (review 2, #3)', () => {
    it('I1 only a definite 4xx refusal is not indeterminate', () => {
        expect(isIndeterminateError(apiError(0))).toBe(true);
        expect(isIndeterminateError(apiError(500))).toBe(true);
        expect(isIndeterminateError(apiError(502))).toBe(true);
        expect(isIndeterminateError(new Error('timeout'))).toBe(true);
        expect(isIndeterminateError(undefined)).toBe(true);
        expect(isIndeterminateError(apiError(400))).toBe(false);
        expect(isIndeterminateError(apiError(422, 'daytime_order_paid'))).toBe(false);
        expect(isIndeterminateError(apiError(409))).toBe(false);
    });
});

describe('payment drawer closable (review 2, #2 #4 #5)', () => {
    const base: PaymentDrawerFlags = {
        stage: 'payment', strict: true, orderUnavailable: false, unrecordable: false, busy: false, confirming: false,
    };
    const closable = (patch: Partial<PaymentDrawerFlags>) => paymentDrawerClosable({ ...base, ...patch });

    it('C1 a just-saved order cannot be left before a step is taken', () => {
        expect(closable({})).toBe(false);
        expect(closable({ stage: 'recording' })).toBe(false);
    });
    it('C2 a resume drawer can be left before a step', () => {
        expect(closable({ strict: false })).toBe(true);
    });
    it('C3 never under an in-flight payment call or an open confirm, whatever else is true', () => {
        for (const patch of [{ strict: false }, { stage: 'failed' as const }, { unrecordable: true }, { orderUnavailable: true }]) {
            expect(closable({ ...patch, busy: true })).toBe(false);
            expect(closable({ ...patch, confirming: true })).toBe(false);
        }
    });
    it('C4 after a failed record the exec can always leave (through the close confirm)', () => {
        expect(closable({ stage: 'failed' })).toBe(true);
    });
    it('C5 an unreadable order or an unprovable paid order is a way out of a strict drawer', () => {
        expect(closable({ orderUnavailable: true })).toBe(true);
        expect(closable({ unrecordable: true })).toBe(true);
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
    it('L1 every trigger button is wrapped in `offer`, and no flow is', () => {
        const wrapped = (file: string, open: string) => {
            const source = read(`${dir}/${file}.tsx`);
            const flow = source.split('\n').filter((line) => line.includes(open));
            expect(flow.length).toBeGreaterThan(0);
            for (const line of flow) expect(line).not.toMatch(/offer|eligible/);
        };
        expect(read(`${dir}/DayOrderDrawer.tsx`)).toMatch(/\{offer && !\(preset\.kind === 'blocked'/);
        expect(read(`${dir}/DayOrderDrawer.tsx`)).toMatch(/\{offer \? \(/);
        expect(read(`${dir}/HolidayForm.tsx`)).toMatch(/\{offer && availability !== 'staff'/);
        expect(read(`${dir}/MarkNotDeliveredForm.tsx`)).toMatch(/const eligible = offer &&/);
        expect(read(`${dir}/LinkCustomerButton.tsx`)).toMatch(/offer \? linkableCandidates/);
        expect(read(`${dir}/PaymentLinkButton.tsx`)).toMatch(/\{offer \? \(/);
        wrapped('HolidayForm', '<HolidayFlow');
        wrapped('MarkNotDeliveredForm', '<Flow');
        wrapped('LinkCustomerButton', '<LinkDrawer');
        wrapped('PaymentLinkButton', '<SendDrawer');
        wrapped('DayOrderDrawer', '<PaymentDrawer');
        wrapped('DayOrderDrawer', '<DayOrderIntake');
    });
    it('L2 staff and money:false hide every placement through one flag', () => {
        const actions = read(`${dir}/OpsActions.tsx`);
        expect(actions).toMatch(/const offer = ctx\.me\.money && !isStaffMatch\(ctx\.snapshot\)/);
        for (const component of ['DayOrderAction', 'HolidayAction', 'MarkNotDeliveredAction', 'LinkCustomerButton', 'DayOrderResumeAction', 'PaymentLinkButton']) {
            expect(actions).toMatch(new RegExp(`<${component}[^>]*offer=\\{`));
        }
    });
    it('M5 the match slot is always mounted and a failed refetch keeps the pane (review 2, #1)', () => {
        const banner = read('src/components/desk/customer/MatchBanner.tsx');
        const line = banner.split('\n').findIndex((item) => item.includes("slots({ at: 'match' })"));
        expect(line).toBeGreaterThan(-1);
        expect(banner.split('\n').slice(Math.max(0, line - 2), line + 1).join('\n')).not.toMatch(/kind === /);
        expect(read('src/components/desk/CustomerPane.tsx')).toMatch(/query\.isError && query\.data === undefined/);
    });
    it('M6 the panel reports an in-flight call and the drawer feeds it to closable (review 2, #4)', () => {
        expect(read(`${dir}/DayOrderPaymentPanel.tsx`)).toMatch(/const setBusy = \(value: boolean\) => \{ setBusyState\(value\); onBusy\(value\); \}/);
        const drawer = read(`${dir}/DayOrderDrawer.tsx`);
        expect(drawer).toMatch(/busy: panelBusy/);
        expect(drawer).toMatch(/strict \|\| stage\.at !== 'payment' \|\| panelBusy/);
    });
    it('M7 every drawer with a confirm switches its own close off while it is open', () => {
        for (const name of ['HolidayForm', 'MarkNotDeliveredForm', 'LinkCustomerButton', 'PaymentLinkButton']) {
            expect(read(`${dir}/${name}.tsx`)).toMatch(/closable=\{!busy && !guard\.confirming\}/);
        }
    });
});
