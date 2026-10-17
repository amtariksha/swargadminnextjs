/** P3b envelope, retry, poll and URL helpers (spec table 8.3). */

import { describe, it, expect } from 'vitest';
import type { DeskEnvelope, DeskErrorCode } from '@/lib/desk/contracts';
import {
    DeskClientError, deskPollInterval, deskRetry, describeDeskError, ticketListPath, toResolveOutcome, unwrapDesk,
} from '@/lib/desk/desk-query';
import type { TicketConflictData, TicketResolveResponse, TicketView } from '@/lib/desk/types';

const T = { id: 't-1' } as TicketView;
const T2 = { id: 't-1', last_inbound_at: '2026-10-12T02:31:00+00:00' } as TicketView;
const failure = (code: DeskErrorCode): DeskEnvelope<TicketResolveResponse, TicketConflictData> => ({
    ok: false, error: { code, message: 'm' },
});

describe('ticketListPath', () => {
    it.each([
        [{ view: 'mine', limit: 100, with_counts: true }, '/api/desk/tickets?view=mine&limit=100&with_counts=1'],
        [
            { view: 'all', limit: 100, queue: 'sales', with_counts: true },
            '/api/desk/tickets?view=all&limit=100&queue=sales&with_counts=1',
        ],
        [{ view: 'acks', limit: 100, with_counts: false }, '/api/desk/tickets?view=acks&limit=100'],
        [{ view: 'list', limit: 1, ticket_no: 123 }, '/api/desk/tickets?view=list&limit=1&ticket_no=123'],
        [
            {
                view: 'list', limit: 100, cursor: '4811', status: 'resolved', q: ' ravi kumar ',
                from: '2026-10-01', to: '2026-10-07',
            },
            '/api/desk/tickets?view=list&limit=100&cursor=4811&status=resolved&q=ravi+kumar&from=2026-10-01&to=2026-10-07',
        ],
        [
            { view: 'list', limit: 100, q: 'a', from: '2026-10-01', to: '2026-10-07' },
            '/api/desk/tickets?view=list&limit=100&from=2026-10-01&to=2026-10-07',
        ],
    ] as const)('builds %j', (params, expected) => {
        expect(ticketListPath(params)).toBe(expected);
    });
});

describe('unwrapDesk', () => {
    it('returns the data of a success', () => {
        expect(unwrapDesk({ ok: true, data: 7 })).toBe(7);
    });
    it('throws a DeskClientError with the code and message', () => {
        try {
            unwrapDesk({ ok: false, error: { code: 'note_required', message: 'm' } });
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(DeskClientError);
            expect((error as DeskClientError).code).toBe('note_required');
            expect((error as DeskClientError).message).toBe('m');
        }
    });
});

describe('toResolveOutcome', () => {
    it('maps a success, also an already-resolved one', () => {
        expect(toResolveOutcome({ ok: true, data: { ticket: T, already_resolved: false } })).toEqual({
            kind: 'resolved', ticket: T, already_resolved: false,
        });
        expect(toResolveOutcome({ ok: true, data: { ticket: T, already_resolved: true } })).toEqual({
            kind: 'resolved', ticket: T, already_resolved: true,
        });
    });
    it('maps a 409 new_customer_message with data to a conflict', () => {
        const envelope: DeskEnvelope<TicketResolveResponse, TicketConflictData> = {
            ok: false, error: { code: 'new_customer_message', message: 'm' }, data: { ticket: T2, action: null },
        };
        expect(toResolveOutcome(envelope)).toEqual({ kind: 'conflict', ticket: T2 });
    });
    it('throws for a 409 without data and for any other failure', () => {
        expect(() => toResolveOutcome(failure('new_customer_message'))).toThrowError(
            expect.objectContaining({ code: 'new_customer_message' }),
        );
        expect(() => toResolveOutcome(failure('category_required'))).toThrowError(
            expect.objectContaining({ code: 'category_required' }),
        );
    });
});

describe('deskRetry', () => {
    it.each(['forbidden', 'validation_failed', 'not_installed'] as const)('never retries %s', (code) => {
        expect(deskRetry(0, new DeskClientError(code, 'm'))).toBe(false);
    });
    it('retries internal_error once', () => {
        const error = new DeskClientError('internal_error', 'm');
        expect([deskRetry(0, error), deskRetry(1, error)]).toEqual([true, false]);
    });
    it('retries authz_unavailable', () => {
        expect(deskRetry(0, new DeskClientError('authz_unavailable', 'm'))).toBe(true);
    });
    it('retries a non-Desk error once', () => {
        const error = new Error('net');
        expect([deskRetry(0, error), deskRetry(1, error)]).toEqual([true, false]);
    });
});

describe('deskPollInterval', () => {
    it('polls when there is no error', () => {
        expect(deskPollInterval(10000, null)).toBe(10000);
    });
    it.each(['unauthorized', 'forbidden', 'ui_disabled', 'not_installed'] as const)('stops on %s', (code) => {
        expect(deskPollInterval(10000, new DeskClientError(code, 'm'))).toBe(false);
    });
    it('keeps polling through transient errors', () => {
        expect(deskPollInterval(10000, new DeskClientError('authz_unavailable', 'm'))).toBe(10000);
        expect(deskPollInterval(10000, new DeskClientError('internal_error', 'm'))).toBe(10000);
        expect(deskPollInterval(10000, new Error('net'))).toBe(10000);
    });
});

describe('describeDeskError', () => {
    it('marks the resolve refusals as inline', () => {
        expect(describeDeskError(new DeskClientError('note_required', 'm'))).toEqual({
            code: 'note_required', text: 'This needs a note.', inline: true,
        });
    });
    it('keeps other Desk errors out of the dialog and passes unknown text through', () => {
        expect(describeDeskError(new DeskClientError('ticket_resolved', 'm')).inline).toBe(false);
        expect(describeDeskError(new DeskClientError('internal_error', 'boom'))).toEqual({
            code: 'internal_error', text: 'boom', inline: false,
        });
    });
    it('treats a plain Error as internal_error', () => {
        expect(describeDeskError(new Error('net'))).toEqual({ code: 'internal_error', text: 'net', inline: false });
    });
});
