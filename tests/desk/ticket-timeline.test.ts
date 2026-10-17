/** P3b timeline merge (spec table 8.8). */

import { describe, it, expect } from 'vitest';
import { buildTimeline } from '@/lib/desk/ticket-timeline';
import type { Category, TicketAction, TicketEvent, TicketEventOf } from '@/lib/desk/types';

const NO_CATEGORIES: ReadonlyMap<string, Category> = new Map();
const T0 = '2026-10-12T02:00:00+00:00';
const T1 = '2026-10-12T02:10:00+00:00';
const T2 = '2026-10-12T02:20:00+00:00';

const base = { ticket_id: 't', from_status: null, to_status: null, assignee_id: null, actor_id: null, actor_name: null };

function created(id: number, at: string): TicketEventOf<'created'> {
    return {
        ...base, id, created_at: at, type: 'created',
        data: { origin: 'inbound', via: 'tick', message_id: null, queue: 'care', lag_secs: null, previous_ticket_id: null },
    };
}
function classified(id: number, at: string): TicketEventOf<'classified'> {
    return {
        ...base, id, created_at: at, type: 'classified',
        data: { category_slug: 'spam', type: 'other', queue: 'care', previous_category: null, source: 'human', after_resolution: false },
    };
}
function statusChanged(id: number, at: string): TicketEventOf<'status_changed'> {
    return { ...base, id, created_at: at, type: 'status_changed', from_status: 'new', to_status: 'open', data: { cause: 'inbound' } };
}
function assigned(id: number, toName: string | null, auto: boolean): TicketEventOf<'assigned'> {
    return { ...base, id, created_at: T0, type: 'assigned', data: { from: null, to: toName === null ? null : '7', to_name: toName, auto } };
}
function refund(id: number, at: string): TicketAction {
    return {
        id, client_action_id: 'c', ticket_id: 't', ref_type: 'transaction', ref_id: '1', amount: 64, verified: true,
        resolved_ticket: true, actor_id: '7', actor_name: 'Asha', created_at: at, action_type: 'refund',
        data: {
            debit_txn_id: 1, order_id: null, delivery_date: null, refund_reason: 'milk_spoilage',
            billed_to_driver: false, billed_driver_id: null, driver_deduction_amount: null, new_wallet_balance: null,
        },
    };
}
function walletCredit(id: number): TicketAction {
    return {
        id, client_action_id: 'c', ticket_id: 't', ref_type: 'transaction', ref_id: '1', amount: null, verified: false,
        resolved_ticket: false, actor_id: '7', actor_name: null, created_at: T0, action_type: 'wallet_credit',
        data: { user_id: 1, description: 'd', payment_id: 'p' },
    };
}

describe('buildTimeline', () => {
    it('orders events and actions by time', () => {
        const rows = buildTimeline([created(1, T0), classified(2, T2)], [refund(1, T1)], NO_CATEGORIES);
        expect(rows.map((row) => row.key)).toEqual(['e-1', 'a-1', 'e-2']);
        expect(rows.map((row) => row.title)).toEqual(['Ticket created', 'Refund ₹64', 'Classified']);
    });
    it('puts an event before an action at the same time', () => {
        const rows = buildTimeline([created(5, T0)], [refund(9, T0)], NO_CATEGORIES);
        expect(rows.map((row) => row.key)).toEqual(['e-5', 'a-9']);
    });
    it('puts the lower id first at the same time', () => {
        const rows = buildTimeline([created(8, T0), created(3, T0)], [], NO_CATEGORIES);
        expect(rows.map((row) => row.key)).toEqual(['e-3', 'e-8']);
    });
    it('describes a status change', () => {
        expect(buildTimeline([statusChanged(1, T0)], [], NO_CATEGORIES)[0].detail).toBe('new → open');
    });
    it('describes an assignment', () => {
        expect(buildTimeline([assigned(1, null, false)], [], NO_CATEGORIES)[0].detail).toBe('unassigned');
        expect(buildTimeline([assigned(1, 'Asha', true)], [], NO_CATEGORIES)[0].detail).toBe('Asha (automatic)');
    });
    it('marks an unverified action without an amount', () => {
        const [row] = buildTimeline([], [walletCredit(1)], NO_CATEGORIES);
        expect(row.title).toBe('Wallet credit');
        expect(row.detail).toBe('not verified');
    });
    it('returns an empty list for empty input', () => {
        expect(buildTimeline([], [], NO_CATEGORIES)).toEqual([]);
    });
    it('does not mutate its inputs', () => {
        const events: TicketEvent[] = [classified(2, T2), created(1, T0)];
        const actions: TicketAction[] = [refund(1, T1)];
        const eventsCopy = structuredClone(events);
        const actionsCopy = structuredClone(actions);
        buildTimeline(events, actions, NO_CATEGORIES);
        expect(events).toEqual(eventsCopy);
        expect(actions).toEqual(actionsCopy);
    });
});
