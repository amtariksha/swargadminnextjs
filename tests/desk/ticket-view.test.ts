import { describe, expect, it } from 'vitest';
import { businessSecondsBetween } from '@/lib/desk/business-hours';
import { compareQueue, computeTicketView, inQueueView, parseTicketSearch } from '@/lib/desk/ticket-view';
import type { BusinessHours, Ticket, TicketComputed } from '@/lib/desk/types';

const ALL: BusinessHours = { start: '05:30', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] };
const WEEK: BusinessHours = { ...ALL, days: [1, 2, 3, 4, 5] };

describe('businessSecondsBetween (imported from business-hours)', () => {
    it.each([
        ['B1', '2026-10-12T04:00:00.000Z', '2026-10-12T04:20:00.000Z', ALL, 1200],
        ['B2', '2026-10-12T17:00:00.000Z', '2026-10-13T00:10:00.000Z', ALL, 600],
        ['B3', '2026-10-12T16:20:00.000Z', '2026-10-13T00:05:00.000Z', ALL, 900],
        ['B4', '2026-10-10T06:00:00.000Z', '2026-10-12T00:10:00.000Z', WEEK, 600],
        ['B5', '2026-10-12T04:20:00.000Z', '2026-10-12T04:00:00.000Z', ALL, 0],
        ['B6', '2026-10-12T04:00:00.123456+00:00', '2026-10-12T04:15:00.000Z', ALL, 899],
        ['B7', '2026-10-12T04:00:00.000Z', '2026-10-12T04:20:00.000Z', { start: '22:00', end: '05:30', days: [0, 1, 2, 3, 4, 5, 6] }, 1200],
        ['B8', '2026-10-11T23:40:00.000Z', '2026-10-12T00:05:00.000Z', ALL, 300],
        ['B9', '2026-07-01T00:00:00.000Z', '2026-10-12T00:00:00.000Z', ALL, 8899200],
        ['B10', 'garbage', '2026-10-12T00:00:00.000Z', ALL, 0],
        ['B11', '2026-10-12T04:00:00.000Z', '2026-10-12T04:20:00.000Z', { ...ALL, days: [] }, 1200],
    ])('%s', (_id, from, to, hours, seconds) => {
        expect(businessSecondsBetween(from, to, hours)).toBe(seconds);
    });
});

type ClockInput = Pick<Ticket, 'status' | 'awaiting_reply_since' | 'follow_up_at'>;
const settings = { reply_alert_mins: 15, business_hours: ALL };
const NOW = new Date('2026-10-12T04:30:00.000Z');
const view = (ticket: ClockInput, now = NOW) => {
    const { attention_since, overdue, waiting_secs } = computeTicketView(ticket, settings, now);
    return { attention_since, overdue, waiting_secs };
};
const row = (status: Ticket['status'], awaiting: string | null, followUp: string | null): ClockInput =>
    ({ status, awaiting_reply_since: awaiting, follow_up_at: followUp });

describe('computeTicketView', () => {
    it.each([
        ['V1', row('open', null, null), NOW, null, false, null],
        ['V2', row('open', '2026-10-12T04:20:00.000000+00:00', null), NOW, '2026-10-12T04:20:00.000000+00:00', false, 600],
        ['V3', row('open', '2026-10-12T04:10:00+00:00', null), NOW, '2026-10-12T04:10:00+00:00', true, 1200],
        ['V4', row('on_hold', null, '2026-10-12T04:00:00+00:00'), NOW, '2026-10-12T04:00:00+00:00', true, 1800],
        ['V5', row('on_hold', null, '2026-10-12T06:00:00+00:00'), NOW, null, false, null],
        ['V6', row('on_hold', '2026-10-12T04:25:00+00:00', '2026-10-12T04:00:00+00:00'), NOW, '2026-10-12T04:00:00+00:00', true, 1800],
        ['V7', row('open', '2026-10-11T17:00:00+00:00', null), new Date('2026-10-12T00:10:00.000Z'), '2026-10-11T17:00:00+00:00', false, 25800],
        ['V8', row('resolved', '2026-10-12T04:00:00+00:00', '2026-10-12T04:00:00+00:00'), NOW, null, false, null],
        ['V9', row('open', '2026-10-12T04:15:00+00:00', null), NOW, '2026-10-12T04:15:00+00:00', false, 900],
        ['V10', row('open', '2026-10-12T04:14:59+00:00', null), NOW, '2026-10-12T04:14:59+00:00', true, 901],
        ['V11', row('on_hold', '2026-10-12T04:25:00+00:00', '2026-10-12T06:00:00+00:00'), NOW, '2026-10-12T04:25:00+00:00', false, 300],
    ] as const)('%s', (_id, ticket, now, attention, overdue, waiting) => {
        expect(view(ticket, now)).toEqual({ attention_since: attention, overdue, waiting_secs: waiting });
    });
});

type QueueRow = Pick<Ticket, 'assigned_to' | 'is_ack_only' | 'priority' | 'opened_at' | 'status' | 'awaiting_reply_since' | 'follow_up_at'> & TicketComputed;
const queueRow = (over: Partial<QueueRow>): QueueRow => ({
    assigned_to: null, is_ack_only: false, priority: 3, opened_at: '2026-10-12T00:00:00+00:00', status: 'open',
    awaiting_reply_since: null, follow_up_at: null, attention_since: null, overdue: false, waiting_secs: null, ...over,
});

describe('compareQueue', () => {
    it('Q1 sorts by attention, then priority, then opened_at, nulls last', () => {
        const rows: Record<string, QueueRow> = {
            a: queueRow({ attention_since: null, priority: 1, opened_at: '2026-10-12T01:00:00+00:00' }),
            b: queueRow({ attention_since: '2026-10-12T04:10:00+00:00', priority: 3, opened_at: '2026-10-12T03:00:00+00:00' }),
            c: queueRow({ attention_since: '2026-10-12T04:00:00+00:00', priority: 3, opened_at: '2026-10-12T03:30:00+00:00' }),
            d: queueRow({ attention_since: '2026-10-12T04:10:00+00:00', priority: 1, opened_at: '2026-10-12T03:50:00+00:00' }),
            e: queueRow({ attention_since: null, priority: 1, opened_at: '2026-10-12T00:30:00+00:00' }),
            f: queueRow({ attention_since: null, priority: 3, opened_at: '2026-10-11T12:00:00+00:00' }),
        };
        const order = Object.keys(rows).sort((x, y) => compareQueue(rows[x], rows[y]));
        expect(order).toEqual(['c', 'd', 'b', 'e', 'a', 'f']);
    });
});

describe('inQueueView', () => {
    const results = (ticket: QueueRow) => (['mine', 'unassigned', 'all', 'acks'] as const).map((v) => inQueueView(ticket, v, '7'));
    it.each([
        ['T1', queueRow({ assigned_to: '7' }), [true, false, true, false]],
        ['T2', queueRow({ assigned_to: '9' }), [false, false, true, false]],
        ['T3', queueRow({ assigned_to: '9', overdue: true }), [true, true, true, false]],
        ['T4', queueRow({}), [false, true, true, false]],
        ['T5', queueRow({ is_ack_only: true, assigned_to: '7', overdue: true }), [false, false, false, true]],
    ])('%s', (_id, ticket, expected) => {
        expect(results(ticket)).toEqual(expected);
    });

    it('never lists a resolved ticket in a queue view', () => {
        expect(inQueueView(queueRow({ status: 'resolved' }), 'all', '7')).toBe(false);
    });
});

describe('parseTicketSearch', () => {
    it.each([
        ['98450 12345', { kind: 'phone', digits: '9845012345', ticketNo: null }],
        ['+91 98450-12345', { kind: 'phone', digits: '919845012345', ticketNo: null }],
        ['1042', { kind: 'phone', digits: '1042', ticketNo: 1042 }],
        ['1234567', { kind: 'phone', digits: '1234567', ticketNo: 1234567 }],
        ['12345678', { kind: 'phone', digits: '12345678', ticketNo: null }],
        ['Asha%_', { kind: 'name', text: 'Asha' }],
        ['a,b)', { kind: 'name', text: 'ab' }],
        ['  Asha   Rao ', { kind: 'name', text: 'Asha Rao' }],
        ['ಆಶಾ', { kind: 'name', text: 'ಆಶಾ' }],
        ['flat 12', { kind: 'name', text: 'flat 12' }],
        [',(', null],
        ['a*', null],
    ])('%j', (input, expected) => {
        expect(parseTicketSearch(input)).toEqual(expected);
    });
});
