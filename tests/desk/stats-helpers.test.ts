/**
 * Helpers behind the stats and review routes: query validation (VQ), error mapping (OE), the time a
 * ticket spent waiting (NR), repeat-complainer grouping (RC) and the epoch rule (EP).
 */

import { describe, expect, it } from 'vitest';
import { reviewQuery } from '@/lib/desk/contracts';
import {
    epochOf, findRepeatComplainers, lowerOf, netResolutionSecs, outcomeToError, validateStatsQuery,
    type StatusEventLike,
} from '@/lib/desk/stats-helpers';

describe('validateStatsQuery', () => {
    it('VQ1 accepts a range without a queue', () => {
        expect(validateStatsQuery({ from: '2026-10-12', to: '2026-10-13' })).toEqual({
            ok: true, range: { from: '2026-10-12', to: '2026-10-13', queue: null },
        });
    });

    it('VQ2 accepts a queue', () => {
        expect(validateStatsQuery({ from: '2026-10-12', to: '2026-10-13', queue: 'sales' })).toEqual({
            ok: true, range: { from: '2026-10-12', to: '2026-10-13', queue: 'sales' },
        });
    });

    it('VQ3 rejects an unknown key', () => {
        const result = validateStatsQuery({ from: '2026-10-12', to: '2026-10-13', x: '1' });
        expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
    });

    it('VQ4 rejects an empty queue and names the field', () => {
        const result = validateStatsQuery({ from: '2026-10-12', to: '2026-10-13', queue: '' });
        expect(result).toMatchObject({ ok: false, code: 'validation_failed' });
        expect(result.ok ? '' : result.message.startsWith('queue:')).toBe(true);
    });

    it('VQ5 rejects an impossible date with the first issue as "<path>: <message>"', () => {
        expect(validateStatsQuery({ from: '2026-02-30', to: '2026-03-01' })).toEqual({
            ok: false, code: 'validation_failed', message: 'from: Invalid ISO date',
        });
    });

    it.each([
        ['VQ6 to before from', { from: '2026-10-13', to: '2026-10-12' }, false],
        ['VQ7 93 days', { from: '2026-07-01', to: '2026-10-01' }, false],
        ['VQ8 92 days', { from: '2026-07-02', to: '2026-10-01' }, true],
    ])('%s', (_id, query, accepted) => {
        const result = validateStatsQuery(query);
        expect(result.ok).toBe(accepted);
        if (!result.ok) expect(result.code).toBe('range_too_large');
    });
});

describe('reviewQuery', () => {
    it('RQ1 rejects a date that is not YYYY-MM-DD', () => {
        expect(reviewQuery.safeParse({ date: '13-10-2026' }).success).toBe(false);
    });

    it('RQ2 accepts no date', () => {
        expect(reviewQuery.safeParse({}).success).toBe(true);
    });
});

describe('outcomeToError', () => {
    it.each([
        ['not_installed', 'not_installed'],
        ['timeout', 'internal_error'],
        ['error', 'internal_error'],
        ['conflict', 'internal_error'],
    ] as const)('OE %s', (outcome, expected) => {
        expect(outcomeToError(outcome)).toBe(expected);
    });
});

describe('epochOf and lowerOf', () => {
    it('EP1 prefers stats_from', () => {
        expect(epochOf({ stats_from: '2026-10-12T00:00:00+05:30', go_live_at: '2026-10-10T00:00:00+05:30' })).toBe('2026-10-12T00:00:00+05:30');
    });

    it('EP2 falls back to go_live_at when stats_from is missing or unreadable', () => {
        expect(epochOf({ stats_from: null, go_live_at: '2026-10-10T00:00:00+05:30' })).toBe('2026-10-10T00:00:00+05:30');
        expect(epochOf({ stats_from: 'garbage', go_live_at: '2026-10-10T00:00:00+05:30' })).toBe('2026-10-10T00:00:00+05:30');
    });

    it('EP3 is null when neither is set', () => {
        expect(epochOf({ stats_from: null, go_live_at: null })).toBeNull();
    });

    it('EP4 lowerOf returns the later instant in UTC', () => {
        expect(lowerOf('2026-10-11T18:30:00.000Z', '2026-10-12T00:00:00+05:30')).toBe('2026-10-11T18:30:00.000Z');
        expect(lowerOf('2026-10-01T00:00:00.000Z', '2026-10-12T00:00:00+05:30')).toBe('2026-10-11T18:30:00.000Z');
    });
});

const OPENED = '2026-10-12T09:00:00+05:30';
const RESOLVED = '2026-10-12T10:00:00+05:30';
const ticket = { id: 'a', opened_at: OPENED, resolved_at: RESOLVED };
const event = (id: number, time: string, to: string | null, ticketId = 'a', type = 'status_changed'): StatusEventLike =>
    ({ id, ticket_id: ticketId, type, from_status: null, to_status: to, created_at: `2026-10-12T${time}:00+05:30` });

describe('netResolutionSecs', () => {
    it.each([
        ['NR1 no events', [], 3600],
        ['NR2 on hold for 30 minutes', [event(1, '09:10', 'on_hold'), event(2, '09:40', 'open')], 1800],
        ['NR3 waiting past the resolve is clipped', [event(1, '09:50', 'waiting_customer'), event(2, '10:30', 'open')], 3000],
        ['NR4 waiting before the open is clipped', [event(1, '08:50', 'waiting_customer')], 0],
        ['NR5 another ticket\'s event is ignored', [event(1, '09:10', 'on_hold', 'b')], 3600],
        ['NR6 events given out of order are sorted', [event(2, '09:40', 'open'), event(1, '09:10', 'on_hold')], 1800],
        ['NR7 a status_changed event without to_status is skipped', [event(1, '09:10', null)], 3600],
    ])('%s', (_id, events, expected) => {
        expect(netResolutionSecs(ticket, events)).toBe(expected);
    });

    it('NR8 a resolved event ends the waiting state and a reopened one starts an open state', () => {
        const events = [
            event(1, '09:05', 'waiting_customer'), event(2, '09:30', null, 'a', 'resolved'),
            event(3, '09:45', null, 'a', 'reopened'), event(4, '09:50', 'waiting_customer'),
        ];
        expect(netResolutionSecs(ticket, events)).toBe(3600 - 1500 - 600);
    });

    it('NR9 an unresolved ticket has no net time', () => {
        expect(netResolutionSecs({ id: 'a', opened_at: OPENED, resolved_at: null }, [])).toBeNull();
    });
});

const complainer = (ticketNo: number, phone: string | null, user: number | null, name: string | null) =>
    ({ ticket_no: ticketNo, customer_phone: phone, backend_user_id: user, customer_name: name });

describe('findRepeatComplainers', () => {
    it('RC1 joins rows of one customer through the user id or the phone', () => {
        const rows = [
            complainer(1, '9199', 5, 'A'), complainer(2, '9199', null, null), complainer(3, '9188', null, 'B'),
            complainer(4, '9177', 5, 'A2'), complainer(5, '9166', null, 'C'), complainer(6, '9166', null, null),
        ];
        expect(findRepeatComplainers(rows, () => true)).toEqual([
            { backend_user_id: 5, customer_phone: '9177', customer_name: 'A2', n: 3, ticket_nos: [1, 2, 4] },
            { backend_user_id: null, customer_phone: '9166', customer_name: 'C', n: 2, ticket_nos: [5, 6] },
        ]);
    });

    it('RC2 needs one row in scope', () => {
        expect(findRepeatComplainers([complainer(1, '9199', 5, 'A'), complainer(2, '9199', 5, 'A')], () => false)).toEqual([]);
    });

    it('RC3 skips rows with neither a phone nor a user', () => {
        expect(findRepeatComplainers([complainer(1, null, null, 'A'), complainer(2, null, null, 'A')], () => true)).toEqual([]);
    });

    it('RC4 keeps at most 50 customers', () => {
        const rows = Array.from({ length: 60 }, (_unused, index) => [
            complainer(index * 2 + 1, `91${String(index).padStart(4, '0')}`, null, null),
            complainer(index * 2 + 2, `91${String(index).padStart(4, '0')}`, null, null),
        ]).flat();
        expect(findRepeatComplainers(rows, () => true)).toHaveLength(50);
    });
});
