import { afterEach, describe, expect, it, vi } from 'vitest';
import { newClientActionId, postTicketAction, toActionOutcome, uuidFromBytes } from '@/lib/desk/action-client';
import type { DeskEnvelope, TicketActionBody } from '@/lib/desk/contracts';
import { DeskClientError } from '@/lib/desk/desk-query';
import type { TicketAction, TicketActionResponse, TicketConflictData, TicketView } from '@/lib/desk/types';

const T = { id: '00000000-0000-4000-8000-000000000041', ticket_no: 41 } as unknown as TicketView;
const A = { id: 7, action_type: 'replacement_promised' } as unknown as TicketAction;
const RESPONSE: TicketActionResponse = { ticket: T, action: A, outcome: 'held', replayed: false, flagged: null };
const BODY: TicketActionBody = {
    action_type: 'replacement_promised',
    client_action_id: '3f1c2b9e-8a4d-4c6e-9f00-1234567890ab',
    seen_inbound_at: '2026-10-17T03:30:00.123456+00:00',
    resolve: false,
    ref_type: 'promise',
    ref_id: 'replacement:41:2026-10-18',
    amount: null,
    hold: { follow_up_at: '2026-10-18T03:00:00+05:30' },
    data: { promised_date: '2026-10-18', note: 'New packet tomorrow', product_name: 'A2 Milk' },
};

type Envelope = DeskEnvelope<TicketActionResponse, TicketConflictData>;
const fail = (code: string, data?: unknown): Envelope => (
    { ok: false, error: { code, message: 'x' }, data } as unknown as Envelope
);

describe('client action ids', () => {
    it('U1 builds a version-4 uuid from fixed bytes', () => {
        expect(uuidFromBytes(new Uint8Array(16).fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
        expect(uuidFromBytes(new Uint8Array(16).fill(0x00))).toBe('00000000-0000-4000-8000-000000000000');
    });

    describe('U2', () => {
        afterEach(() => { vi.unstubAllGlobals(); });

        it('returns a lower-case v4 uuid', () => {
            expect(newClientActionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        });

        it('falls back to getRandomValues when randomUUID is missing', () => {
            vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xab) });
            expect(newClientActionId()).toBe('abababab-abab-4bab-abab-abababababab');
        });
    });
});

describe('toActionOutcome', () => {
    it('O1 returns done for a 200 envelope', () => {
        expect(toActionOutcome({ ok: true, data: RESPONSE })).toEqual({ kind: 'done', response: RESPONSE });
    });

    it('O2 returns the fresh ticket and the recorded action for a 409', () => {
        expect(toActionOutcome(fail('new_customer_message', { ticket: T, action: A })))
            .toEqual({ kind: 'conflict', ticket: T, action: A });
    });

    it('O3 accepts a 409 whose action is null', () => {
        expect(toActionOutcome(fail('new_customer_message', { ticket: T, action: null })))
            .toEqual({ kind: 'conflict', ticket: T, action: null });
    });

    it.each([
        ['a 409 without data', fail('new_customer_message'), 'new_customer_message'],
        ['reference_mismatch', fail('reference_mismatch'), 'reference_mismatch'],
        ['money_not_allowed', fail('money_not_allowed'), 'money_not_allowed'],
    ])('O4 throws a DeskClientError for %s', (_name, envelope, code) => {
        const run = () => toActionOutcome(envelope);
        expect(run).toThrow(DeskClientError);
        expect(run).toThrow(expect.objectContaining({ code }));
    });
});

describe('postTicketAction', () => {
    const fetchMock = vi.fn();
    afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

    function answer(status: number, body: string): void {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockImplementation(() => Promise.resolve(new Response(body, { status })));
    }

    it('P1 posts the body untouched, keeping the six-digit seen token', async () => {
        answer(200, JSON.stringify({ ok: true, data: RESPONSE }));
        await expect(postTicketAction(T.id, BODY)).resolves.toEqual({ kind: 'done', response: RESPONSE });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Headers }];
        expect(url).toBe(`/api/desk/tickets/${T.id}/actions`);
        expect(init.method).toBe('POST');
        expect(init.headers.get('content-type')).toBe('application/json');
        expect(JSON.parse(String(init.body))).toEqual(BODY);
        expect(String(init.body)).toContain('"seen_inbound_at":"2026-10-17T03:30:00.123456+00:00"');
    });

    it('P2 rejects with internal_error while route 6 is not merged (HTML 404)', async () => {
        answer(404, '<!DOCTYPE html><html></html>');
        await expect(postTicketAction(T.id, BODY)).rejects.toMatchObject({ code: 'internal_error' });
    });

    it('P3 rejects with internal_error on a network failure', async () => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(postTicketAction(T.id, BODY)).rejects.toMatchObject({ code: 'internal_error', message: 'Network error' });
    });
});
