/**
 * Route 3 (paged ticket messages) and the shared stored-number helper: row mapping (8.10), paging
 * (8.11), the service over a recording stand-in for supabaseAdmin (8.12) and storedSendNumber (8.13).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeskApiError } from '@/lib/desk/api-error';
import { DESK_WRAPPED } from '@/lib/desk/authz';
import { allOffDeskSettings } from '@/lib/desk/settings';
import type { DeskContext } from '@/lib/desk/types';

type Row = Record<string, unknown>;
interface Result { data: unknown; error: { code?: string; message?: string } | null }

const fake = vi.hoisted(() => ({
    ticket: null as Row | null,
    conversationRead: { data: null, error: null } as Result,
    messages: { data: [], error: null } as Result,
    numbers: { data: [], error: null } as Result,
    throwOnFrom: null as string | null,
    calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
}));

class RecordingQuery implements PromiseLike<Result> {
    constructor(private readonly table: string) {}

    private record(op: string, args: unknown[]): this {
        fake.calls.push({ table: this.table, op, args });
        return this;
    }

    select(...args: unknown[]): this { return this.record('select', args); }
    eq(...args: unknown[]): this { return this.record('eq', args); }
    lte(...args: unknown[]): this { return this.record('lte', args); }
    order(...args: unknown[]): this { return this.record('order', args); }
    limit(...args: unknown[]): this { return this.record('limit', args); }

    async maybeSingle(): Promise<Result> {
        fake.calls.push({ table: this.table, op: 'maybeSingle', args: [] });
        if (this.table === 'desk_tickets') return { data: fake.ticket, error: null };
        if (this.table === 'conversations') return fake.conversationRead;
        return { data: null, error: null };
    }

    then<A = Result, B = never>(
        onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
        onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> {
        const result = this.table === 'messages' ? fake.messages : this.table === 'integrated_numbers' ? fake.numbers : { data: null, error: null };
        return Promise.resolve(result).then(onfulfilled, onrejected);
    }
}

vi.mock('@/lib/whatsapp/supabase', () => ({
    supabaseAdmin: {
        from: (table: string) => {
            if (fake.throwOnFrom === table) throw new Error('boom 919876543210');
            fake.calls.push({ table, op: 'from', args: [] });
            return new RecordingQuery(table);
        },
    },
}));

import {
    DESK_THREAD_COLUMNS, listTicketMessages, toDeskMessage, toMessagesPage, type MessageRow,
} from '@/lib/desk/api/ticket-messages';
import { storedSendNumber } from '@/lib/desk/send-number-io';

const T1 = '2026-10-12T02:30:00.123456+00:00';
const T2 = '2026-10-12T02:31:00+00:00';
const T3 = '2026-10-12T02:32:00.5+00:00';
const TICKET_ID = '11111111-2222-4333-8444-555555555555';

const ctx: DeskContext = {
    actor: { id: '7', name: 'Asha' },
    rights: { agent: true, manager: false, money: true, inbox: true, via: 'permission' },
    token: 'tok',
    settings: { ...allOffDeskSettings(), readable: true, ui_enabled: true },
};

const blankRow = (over: Partial<MessageRow> = {}): MessageRow => ({
    id: 'm1', conversation_id: 'c1', direction: 'outbound', content_type: 'text', body: 'hi', media_url: null,
    file_name: null, status: 'read', is_internal_note: false, created_at: T1, source: 'webapp', failure_reason: null,
    ticket_id: 't1', template_name: null, sent_by_user_id: '42', sent_by_name: 'Asha', ...over,
});

const nulled = (over: Partial<MessageRow> = {}): MessageRow => ({
    id: 'm2', conversation_id: 'c1', direction: 'inbound', content_type: null, body: null, media_url: null,
    file_name: null, status: null, is_internal_note: null, created_at: T2, source: null, failure_reason: null,
    ticket_id: null, template_name: null, sent_by_user_id: null, sent_by_name: null, ...over,
});

const catching = async (task: Promise<unknown>): Promise<DeskApiError> => {
    try { await task; } catch (error) { return error as DeskApiError; }
    throw new Error('expected a DeskApiError');
};

beforeEach(() => {
    fake.ticket = { id: TICKET_ID, conversation_id: 'c1' };
    fake.conversationRead = { data: null, error: null };
    fake.messages = { data: [], error: null };
    fake.numbers = { data: [], error: null };
    fake.throwOnFrom = null;
    fake.calls = [];
});

afterEach(() => { vi.restoreAllMocks(); });

describe('toDeskMessage (8.10)', () => {
    it('maps every column and leaves empty media fields undefined', () => {
        const message = toDeskMessage(blankRow());
        expect(message).toEqual({
            id: 'm1', conversationId: 'c1', direction: 'outbound', contentType: 'text', body: 'hi', status: 'read',
            isInternalNote: false, timestamp: T1, source: 'webapp', ticketId: 't1', templateName: null,
            sentByUserId: '42', sentByName: 'Asha',
        });
        expect(message.mediaUrl).toBeUndefined();
        expect(message.fileName).toBeUndefined();
        expect(message.failureReason).toBeUndefined();
    });

    it('applies the defaults for null columns', () => {
        expect(toDeskMessage(nulled())).toMatchObject({
            direction: 'inbound', contentType: 'text', status: 'sent', isInternalNote: false, source: undefined,
            body: '', ticketId: null, templateName: null, sentByUserId: null, sentByName: null,
        });
    });

    it('renders raw MSG91 template JSON as readable text', () => {
        const body = '{"body_1":{"type":"text","parameter_name":"name","text":"Dhivya"}}';
        expect(toDeskMessage(blankRow({ body })).body).toBe('Dhivya');
    });

    it('treats the legacy "internal" direction as an outbound internal note', () => {
        const message = toDeskMessage(blankRow({ direction: 'internal', is_internal_note: null }));
        expect(message.direction).toBe('outbound');
        expect(message.isInternalNote).toBe(true);
    });

    it('keeps voice_call and received as they are stored', () => {
        expect(toDeskMessage(blankRow({ content_type: 'voice_call', status: 'received' }))).toMatchObject({
            contentType: 'voice_call', status: 'received',
        });
    });
});

describe('toMessagesPage (8.11)', () => {
    const r = (id: string, created_at: string) => blankRow({ id, created_at });

    it('returns the page oldest first with the oldest timestamp as cursor on a full page', () => {
        const page = toMessagesPage([r('r3', T3), r('r2', T2), r('r1', T1)], 3);
        expect(page.items.map((item) => item.id)).toEqual(['r1', 'r2', 'r3']);
        expect(page.older_cursor).toBe(T1);
    });

    it('has no cursor on a short page', () => {
        const page = toMessagesPage([r('r3', T3), r('r2', T2)], 3);
        expect(page.items.map((item) => item.id)).toEqual(['r2', 'r3']);
        expect(page.older_cursor).toBeNull();
    });

    it('is empty without rows', () => {
        expect(toMessagesPage([], 30)).toEqual({ items: [], older_cursor: null });
    });

    it('does not mutate its input', () => {
        const rows = [r('r3', T3), r('r2', T2)];
        toMessagesPage(rows, 2);
        expect(rows.map((row) => row.id)).toEqual(['r3', 'r2']);
    });
});

describe('listTicketMessages (8.12)', () => {
    const onMessages = () => fake.calls.filter((call) => call.table === 'messages');

    it('answers not_found for an unknown ticket', async () => {
        fake.ticket = null;
        const error = await catching(listTicketMessages(TICKET_ID, { limit: 30 }, ctx));
        expect(error).toBeInstanceOf(DeskApiError);
        expect(error.code).toBe('not_found');
    });

    it('returns an empty page without querying messages when the ticket has no conversation', async () => {
        fake.ticket = { id: TICKET_ID, conversation_id: null };
        await expect(listTicketMessages(TICKET_ID, { limit: 30 }, ctx)).resolves.toEqual({ items: [], older_cursor: null });
        expect(fake.calls.some((call) => call.table === 'messages')).toBe(false);
    });

    it('selects the thread columns newest first without a before filter', async () => {
        await listTicketMessages(TICKET_ID, { limit: 2 }, ctx);
        expect(onMessages().map((call) => [call.op, ...call.args])).toEqual([
            ['from'],
            ['select', DESK_THREAD_COLUMNS],
            ['eq', 'conversation_id', 'c1'],
            ['order', 'created_at', { ascending: false }],
            ['order', 'id', { ascending: false }],
            ['limit', 2],
        ]);
    });

    it('passes the before cursor through untouched, before the ordering', async () => {
        await listTicketMessages(TICKET_ID, { limit: 200, before: T1 }, ctx);
        const ops = onMessages().map((call) => call.op);
        expect(ops.indexOf('lte')).toBeGreaterThan(ops.indexOf('eq'));
        expect(ops.indexOf('lte')).toBeLessThan(ops.indexOf('order'));
        expect(onMessages().find((call) => call.op === 'lte')?.args).toEqual(['created_at', T1]);
    });

    it('maps rows into an oldest-first page', async () => {
        fake.messages = { data: [blankRow({ id: 'b', created_at: T2 }), blankRow({ id: 'a', created_at: T1 })], error: null };
        const page = await listTicketMessages(TICKET_ID, { limit: 2 }, ctx);
        expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
        expect(page.older_cursor).toBe(T1);
    });

    it('reports not_installed when the Desk message columns are missing', async () => {
        fake.messages = { data: null, error: { code: '42703', message: 'column messages.ticket_id does not exist' } };
        const error = await catching(listTicketMessages(TICKET_ID, { limit: 30 }, ctx));
        expect(error.code).toBe('not_installed');
    });

    it('wraps GET in withDesk at agent level, not always-on', async () => {
        const route = await import('@/app/api/desk/tickets/[id]/messages/route');
        const marker = (route.GET as unknown as Record<symbol, unknown>)[DESK_WRAPPED];
        expect(marker).toEqual({ level: 'agent', alwaysOn: false });
    });
});

describe('storedSendNumber (8.13)', () => {
    const SALES = '917090166111';
    const CARE = '917996196111';
    const active = [{ number: SALES }, { number: CARE }];

    it.each([undefined, '', 42])('returns null without reading anything for conversationId %s', async (conversationId) => {
        await expect(storedSendNumber({ conversationId, bodyNumber: SALES, tag: 'Chat Send' })).resolves.toBeNull();
        expect(fake.calls).toEqual([]);
    });

    it('uses the conversation number over a different body number and logs the override once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        fake.conversationRead = { data: { integrated_number: CARE }, error: null };
        fake.numbers = { data: active, error: null };
        await expect(storedSendNumber({ conversationId: 'conv-1', bodyNumber: SALES, tag: 'Chat Send' })).resolves.toBe(CARE);
        expect(warn).toHaveBeenCalledTimes(1);
        const text = String(warn.mock.calls[0][0]);
        expect(text).toContain('conv-1');
        expect(text.replace('conv-1', '')).not.toMatch(/\d{6,}/);
    });

    it('does not log when the body already names the conversation number', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        fake.conversationRead = { data: { integrated_number: CARE }, error: null };
        fake.numbers = { data: active, error: null };
        await expect(storedSendNumber({ conversationId: 'conv-1', bodyNumber: CARE, tag: 'Chat Send' })).resolves.toBe(CARE);
        expect(warn).not.toHaveBeenCalled();
    });

    it.each([
        ['the literal default', 'default'],
        ['a number that is not active', '910000000000'],
    ])('returns null for %s so the route keeps the body number', async (_label, stored) => {
        fake.conversationRead = { data: { integrated_number: stored }, error: null };
        fake.numbers = { data: active, error: null };
        await expect(storedSendNumber({ conversationId: 'conv-1', bodyNumber: SALES, tag: 'Chat Send' })).resolves.toBeNull();
    });

    it('returns null when the conversation read finds nothing', async () => {
        fake.numbers = { data: active, error: null };
        await expect(storedSendNumber({ conversationId: 'conv-1', bodyNumber: SALES, tag: 'Chat Send' })).resolves.toBeNull();
    });

    it('returns null and warns once when the lookup throws', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        fake.throwOnFrom = 'conversations';
        await expect(storedSendNumber({ conversationId: 'conv-1', bodyNumber: SALES, tag: 'Chat Send' })).resolves.toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('stored-number lookup failed');
        expect(JSON.stringify(warn.mock.calls[0])).not.toContain('9198765');
    });
});
