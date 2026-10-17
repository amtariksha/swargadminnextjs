/**
 * isHumanReply (W01-W29), isTemplateBody (TB), compareMessages (CM) and deriveTicketClock
 * (C01-C25). The clock is derived from stored message facts alone, so every fixture is a
 * plain object with an explicit-offset timestamp and the suite is identical in any time zone.
 */

import { describe, it, expect } from 'vitest';
import {
    compareMessages,
    deriveTicketClock,
    isHumanReply,
    isTemplateBody,
    type DeskMessageFacts,
    type TicketClock,
} from '@/lib/desk/clock';

const PLAIN_BODY = 'Your order is on the way';
const TEMPLATE_ECHO_BODY = '[Template] Dhivya · 64';
const RAW_TEMPLATE_JSON = '{"body_1":{"type":"text","parameter_name":"name","text":"Dhivya"}}';

// ── isHumanReply ───────────────────────────────────────────────────────────

type WriterVector = [
    id: string,
    direction: string,
    contentType: string,
    status: string,
    source: string | null,
    templateName: string | null,
    isInternalNote: boolean | null,
    expected: boolean,
    body?: string,
];

const WRITER_VECTORS: WriterVector[] = [
    ['W01', 'inbound', 'text', 'delivered', 'customer', null, null, false],
    ['W02', 'inbound', 'text', 'delivered', 'ctwa', null, null, false],
    ['W03', 'inbound', 'image', 'delivered', 'customer', null, null, false],
    ['W04', 'outbound', 'text', 'sent', 'mobile_app', null, null, true],
    ['W05', 'outbound', 'text', 'sent', 'api', null, null, true],
    ['W06', 'outbound', 'text', 'sent', 'api', 'swarg_credit_debit', null, false],
    ['W07', 'outbound', 'text', 'sent', 'api', null, null, false, TEMPLATE_ECHO_BODY],
    ['W08', 'outbound', 'text', 'sent', 'api', 'low_balance', null, false, ''],
    ['W09', 'outbound', 'text', 'sent', 'broadcast', 'diwali_offer', null, false],
    ['W10', 'outbound', 'text', 'sent', 'broadcast', null, null, false, 'Festive offer inside'],
    ['W11', 'outbound', 'text', 'sent', 'mobile_app', null, null, true],
    ['W12', 'outbound', 'text', 'sent', 'api', null, null, false, TEMPLATE_ECHO_BODY],
    ['W13', 'inbound', 'text', 'received', 'customer', null, null, false],
    ['W14', 'outbound', 'text', 'sent', 'mobile_app', null, null, true],
    ['W15', 'outbound', 'text', 'sent', 'webapp', null, false, true],
    ['W16', 'outbound', 'image', 'sent', 'webapp', null, false, true],
    ['W17', 'outbound', 'template', 'sent', 'webapp', null, false, false],
    ['W18', 'outbound', 'text', 'failed', 'webapp', null, false, false],
    ['W19', 'outbound', 'text', 'failed', 'webapp', null, false, false],
    ['W20', 'outbound', 'text', 'read', 'webapp', null, false, true],
    ['W21', 'outbound', 'text', 'sent', 'webapp', null, true, false],
    ['W22', 'outbound', 'text', 'sent', 'webapp', null, false, true],
    ['W23', 'outbound', 'text', 'failed', 'webapp', null, false, false],
    ['W24', 'outbound', 'interactive', 'sent', 'webapp', null, null, true],
    ['W25', 'outbound', 'interactive', 'failed', 'webapp', null, null, false],
    ['W26', 'outbound', 'voice_call', 'sent', 'webapp', null, null, true],
    ['W27', 'internal', 'text', 'internal', null, null, null, false],
    ['W28', 'out', 'text', 'queued', null, null, null, false],
    ['W29', 'outbound', 'text', 'sent', 'api', null, null, false, RAW_TEMPLATE_JSON],
];

function writerRow(vector: WriterVector): DeskMessageFacts {
    const [id, direction, contentType, status, source, templateName, isInternalNote, , body] = vector;
    return {
        id,
        direction,
        content_type: contentType,
        status,
        source,
        template_name: templateName,
        is_internal_note: isInternalNote,
        body: body ?? PLAIN_BODY,
        media_url: null,
        created_at: '2026-10-12T08:00:00.000+05:30',
    };
}

describe('isHumanReply', () => {
    it.each(WRITER_VECTORS)('%s', (...vector) => {
        expect(isHumanReply(writerRow(vector))).toBe(vector[7]);
    });

    it('carries every vector of the spec', () => expect(WRITER_VECTORS).toHaveLength(29));

    it('is false for null and undefined', () => {
        expect(isHumanReply(null)).toBe(false);
        expect(isHumanReply(undefined)).toBe(false);
    });

    it('counts a row with a null status and ignores case and padding in status and content type', () => {
        const base = writerRow(WRITER_VECTORS[4]);
        expect(isHumanReply({ ...base, status: null })).toBe(true);
        expect(isHumanReply({ ...base, status: ' FAILED ' })).toBe(false);
        expect(isHumanReply({ ...base, content_type: ' Template ' })).toBe(false);
        expect(isHumanReply({ ...base, template_name: '   ' })).toBe(true);
    });
});

// ── isTemplateBody ─────────────────────────────────────────────────────────

const TEMPLATE_BODY_VECTORS: Array<[id: string, body: string | null | undefined, expected: boolean]> = [
    ['TB01', '[Template] Dhivya · 64', true],
    ['TB02', '   [Template: low_balance]', true],
    ['TB03', RAW_TEMPLATE_JSON, true],
    ['TB04', '{"a":{"parameter_name":"x"},"b":{"text":"y"}}', false],
    ['TB05', '{}', false],
    ['TB06', '[{"parameter_name":"x"}]', false],
    ['TB07', '{"foo":"bar"}', false],
    ['TB08', '{not json', false],
    ['TB09', '[swarg_credit_debit] Dhivya · 64', false],
    ['TB10', 'Hello [Template] there', false],
    ['TB11', 'Template', false],
    ['TB12', null, false],
    ['TB13', undefined, false],
];

describe('isTemplateBody', () => {
    it.each(TEMPLATE_BODY_VECTORS)('%s', (_id, body, expected) => {
        expect(isTemplateBody(body)).toBe(expected);
    });

    it('carries every vector of the spec', () => expect(TEMPLATE_BODY_VECTORS).toHaveLength(13));
});

// ── compareMessages ────────────────────────────────────────────────────────

const message = (id: string, direction: string, createdAt: string): DeskMessageFacts => ({
    id, direction, content_type: 'text', status: 'sent', source: null, template_name: null,
    is_internal_note: null, body: 'x', created_at: createdAt,
});

describe('compareMessages', () => {
    const EIGHT = '2026-10-12T08:00:00+05:30';
    const vectors: Array<[id: string, a: DeskMessageFacts, b: DeskMessageFacts, expected: number]> = [
        ['CM1', message('a', 'inbound', EIGHT), message('b', 'outbound', '2026-10-12T08:00:01+05:30'), -1],
        ['CM2', message('a', 'inbound', EIGHT), message('b', 'outbound', '2026-10-12T02:30:00+00:00'), 1],
        ['CM3', message('a', 'inbound', EIGHT), message('b', 'inbound', '2026-10-12T02:30:00.000Z'), -1],
        ['CM4', message('m10', 'inbound', EIGHT), message('m9', 'inbound', EIGHT), -1],
        ['CM5', message('b', 'outbound', EIGHT), message('b', 'outbound', EIGHT), 0],
    ];

    it.each(vectors)('%s', (_id, a, b, expected) => {
        expect(Math.sign(compareMessages(a, b))).toBe(expected);
    });

    it('carries every vector of the spec', () => expect(vectors).toHaveLength(5));
});

// ── deriveTicketClock ──────────────────────────────────────────────────────

const at = (hhmm: string): string => (hhmm.includes('T') ? hhmm : `2026-10-12T${hhmm}:00.000+05:30`);

const inb = (id: string, hhmm: string, overrides: Partial<DeskMessageFacts> = {}): DeskMessageFacts => ({
    id,
    direction: 'inbound',
    content_type: 'text',
    status: 'delivered',
    source: 'customer',
    template_name: null,
    is_internal_note: null,
    body: PLAIN_BODY,
    media_url: null,
    created_at: at(hhmm),
    ...overrides,
});

const out = (id: string, hhmm: string, overrides: Partial<DeskMessageFacts> = {}): DeskMessageFacts => ({
    id,
    direction: 'outbound',
    content_type: 'text',
    status: 'sent',
    source: 'webapp',
    template_name: null,
    is_internal_note: false,
    body: PLAIN_BODY,
    media_url: null,
    created_at: at(hhmm),
    ...overrides,
});

type FirstResponse = [time: string, id: string, source: 'panel' | 'phone'] | null;

/** [last_inbound_at, last_outbound_at, awaiting_reply_since, first response, status]; times are HH:MM or full ISO strings. */
type ClockExpectation = [string | null, string | null, string | null, FirstResponse, TicketClock['status']];

interface ClockRow {
    id: string;
    opened: string;
    reopened: string | null;
    messages: DeskMessageFacts[];
    expected: ClockExpectation;
}

const clockRow = (
    id: string, opened: string, reopened: string | null, messages: DeskMessageFacts[], expected: ClockExpectation,
): ClockRow => ({ id, opened, reopened, messages, expected });

const FAILED = { status: 'failed' };
const PHONE = { source: 'mobile_app' };
const P2: FirstResponse = ['08:04', 'm2', 'panel'];
const P5: FirstResponse = ['08:05', 'm2', 'panel'];

const CLOCK_ROWS: ClockRow[] = [
    clockRow('C01', '08:00', null, [inb('m1', '08:00')], ['08:00', null, '08:00', null, 'new']),
    clockRow('C02', '08:00', null, [inb('m1', '08:00'), out('m2', '08:04')], ['08:00', '08:04', null, P2, 'waiting_customer']),
    clockRow('C03', '08:00', null, [inb('m1', '08:00'), out('m2', '08:04'), inb('m3', '08:10')], ['08:10', '08:04', '08:10', P2, 'open']),
    clockRow('C04', '08:00', null, [inb('m1', '08:00'), inb('m2', '08:01'), inb('m3', '08:02')], ['08:02', null, '08:00', null, 'new']),
    clockRow('C05', '08:00', null, [inb('m1', '08:00'), out('m2', '08:03', FAILED)], ['08:00', null, '08:00', null, 'new']),
    clockRow('C06', '08:00', null, [inb('m1', '08:00'), out('m2', '08:02', FAILED), out('m3', '08:06')], ['08:00', '08:06', null, ['08:06', 'm3', 'panel'], 'waiting_customer']),
    clockRow('C07', '08:00', null, [inb('m1', '08:00'), out('m2', '08:02', { is_internal_note: true })], ['08:00', null, '08:00', null, 'new']),
    clockRow('C08', '08:00', null, [inb('m1', '08:00'), out('m2', '08:02', { content_type: 'template' })], ['08:00', null, '08:00', null, 'new']),
    clockRow('C09', '08:00', null, [
        inb('m1', '08:00'), out('m2', '08:01', { source: 'api', template_name: 'swarg_credit_debit' }),
        out('m3', '08:02', { source: 'broadcast' }),
    ], ['08:00', null, '08:00', null, 'new']),
    clockRow('C10', '08:00', null, [inb('m1', '08:00'), out('m2', '08:05', PHONE)], ['08:00', '08:05', null, ['08:05', 'm2', 'phone'], 'waiting_customer']),
    clockRow('C11', '08:00', null, [inb('m2', '08:00'), out('m1', '08:00')], ['08:00', '08:00', '08:00', null, 'open']),
    clockRow('C12', '08:00', '09:00', [inb('m1', '08:00'), out('m2', '08:05'), inb('m3', '09:00')], ['09:00', '08:05', '09:00', P5, 'open']),
    clockRow('C13', '08:00', '10:30', [inb('m1', '08:00'), inb('m2', '10:30')], ['10:30', null, '10:30', null, 'new']),
    clockRow('C14', '08:00', '08:40', [inb('m1', '08:00'), out('m2', '08:05'), inb('m3', '08:20'), inb('m4', '08:40')], ['08:40', '08:05', '08:40', P5, 'open']),
    clockRow('C15', '09:00', null, [out('m1', '09:00')], [null, '09:00', null, ['09:00', 'm1', 'panel'], 'waiting_customer']),
    clockRow('C16', '08:00', null, [inb('m0', '07:00'), out('m00', '07:05'), inb('m1', '08:00')], ['08:00', null, '08:00', null, 'new']),
    clockRow('C17', '08:00', null, [inb('m1', '08:00'), inb('m2', '08:03')], ['08:03', null, '08:00', null, 'new']),
    clockRow('C18', '08:00', null, [inb('m1', '08:00'), out('m2', '08:03', PHONE)], ['08:00', '08:03', null, ['08:03', 'm2', 'phone'], 'waiting_customer']),
    clockRow('C19', '08:00', null, [inb('m1', '08:00'), out('m2', '08:03', FAILED), inb('m3', '08:20')], ['08:20', null, '08:00', null, 'new']),
    clockRow('C20', '08:00', null, [
        inb('m1', '08:00'), out('m2', '08:01', { direction: 'internal', status: 'internal' }),
        out('m3', '08:02', { direction: 'out', status: 'queued' }),
    ], ['08:00', null, '08:00', null, 'new']),
    clockRow('C21', '08:00', null, [inb('m1', '08:00'), out('m2', '08:02', { content_type: 'voice_call' })], ['08:00', '08:02', null, ['08:02', 'm2', 'panel'], 'waiting_customer']),
    clockRow('C22', '08:00', null, [], [null, null, null, null, 'new']),
    clockRow('C23', '08:00', null, [inb('m1', '08:00'), out('m2', '08:05'), inb('m3', '08:10'), out('m4', '08:12', FAILED)], ['08:10', '08:05', '08:10', P5, 'open']),
    clockRow('C24', '08:00', '09:00', [inb('m1', '08:00'), out('m2', '08:05'), inb('m3', '08:06')], ['08:06', '08:05', null, P5, 'waiting_customer']),
    clockRow('C25', '2026-10-12T02:30:00+00:00', null, [inb('m1', '2026-10-12T02:30:00+00:00'), out('m2', '08:04')], ['2026-10-12T02:30:00+00:00', '08:04', null, P2, 'waiting_customer']),
];

function expectedClock(ticketRow: ClockRow): TicketClock {
    const [lastInbound, lastOutbound, awaiting, firstResponse, status] = ticketRow.expected;
    const time = (value: string | null): string | null => (value === null ? null : at(value));
    return {
        last_inbound_at: time(lastInbound),
        last_outbound_at: time(lastOutbound),
        awaiting_reply_since: time(awaiting),
        first_response_at: firstResponse ? at(firstResponse[0]) : null,
        first_response_message_id: firstResponse ? firstResponse[1] : null,
        first_response_source: firstResponse ? firstResponse[2] : null,
        status,
    };
}

function deriveFrozen(row: ClockRow, messages: DeskMessageFacts[]): TicketClock {
    const frozen = Object.freeze(messages.map((item) => Object.freeze({ ...item })));
    const ticket = Object.freeze({ opened_at: at(row.opened), last_reopened_at: row.reopened ? at(row.reopened) : null });
    return deriveTicketClock(frozen, ticket);
}

describe('deriveTicketClock', () => {
    it.each(CLOCK_ROWS)('$id', (row) => {
        expect(deriveFrozen(row, row.messages)).toEqual(expectedClock(row));
    });

    it.each(CLOCK_ROWS)('$id gives the same result for the reversed array', (row) => {
        expect(deriveFrozen(row, [...row.messages].reverse())).toEqual(deriveFrozen(row, row.messages));
    });

    it('carries every vector of the spec', () => {
        expect(CLOCK_ROWS).toHaveLength(25);
    });

    it('returns the input timestamp strings unchanged', () => {
        const micro = '2026-10-12T02:30:00.123456+00:00';
        const clock = deriveTicketClock([inb('m1', micro), out('m2', '09:00')], { opened_at: micro, last_reopened_at: null });
        expect(clock.last_inbound_at).toBe(micro);
        expect(clock.first_response_at).toBe(at('09:00'));
    });

    it('gives the same result for every permutation of the input', () => {
        const row = CLOCK_ROWS[13];
        const [a, b, c, d] = row.messages;
        const permutations = [[a, b, c, d], [d, c, b, a], [c, a, d, b], [b, d, a, c]];
        for (const order of permutations) {
            expect(deriveFrozen(row, order)).toEqual(expectedClock(row));
        }
    });

    it('does not mutate the input array or its objects', () => {
        const messages = [inb('m2', '08:10'), inb('m1', '08:00')];
        const snapshot = JSON.stringify(messages);
        deriveTicketClock(messages, { opened_at: at('08:00'), last_reopened_at: null });
        expect(JSON.stringify(messages)).toBe(snapshot);
        expect(messages.map((item) => item.id)).toEqual(['m2', 'm1']);
    });
});
