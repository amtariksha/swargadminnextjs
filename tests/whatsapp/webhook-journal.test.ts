import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/whatsapp/supabase', async () => {
    const { fakeSupabase } = await import('./fake-supabase');
    return { supabaseAdmin: fakeSupabase, supabase: fakeSupabase };
});

import { clearWebhookAuthCache, type AuthVerdict } from '@/lib/whatsapp/webhook-auth';
import {
    clearWebhookJournalState, decideJournalRow, isStatusOnlyPayload, JournalNotInstalledError, noteClassifiedDirection,
    outcomeFromResponseBody, parseJournalPayload, providerMessageId, replayJournal, runJournaledWebhook,
    type JournalRow, type WebhookProvider,
} from '@/lib/whatsapp/webhook-journal';
import { callsOf, fakeStore, resetFakeStore, type Row } from './fake-supabase';

const NOW = new Date('2026-10-20T06:00:00.000Z');
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const BASE = { customerNumber: '919845012345', integratedNumber: '917090166111', content: 'Milk was sour', uuid: 'u-1', customerName: 'Ravi' };
const { uuid: _uuid, ...NO_UUID } = BASE;
void _uuid;
const metaValue = (value: Row) => ({ entry: [{ changes: [{ value }] }] });

const ACCEPT: AuthVerdict = { result: 'no_secret', accept: true, carried: false };
const MISMATCH: AuthVerdict = { result: 'mismatch', accept: false, carried: true };

beforeEach(() => {
    clearWebhookAuthCache();
    clearWebhookJournalState();
    resetFakeStore();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('outcomeFromResponseBody', () => {
    it.each([
        ['O01', { success: true, conversationId: 'c' }, 200, 'processed', 'stored'],
        ['O02', { success: true, type: 'duplicate_skipped' }, 200, 'skipped', 'duplicate_skipped'],
        ['O03', { success: true, type: 'echo_upgraded' }, 200, 'processed', 'echo_upgraded'],
        ['O04', { success: true, type: 'delivery_report' }, 200, 'processed', 'delivery_report'],
        ['O05', { received: true, skipped: 'outbound_no_existing_contact' }, 200, 'skipped', 'outbound_no_existing_contact'],
        ['O06', { received: true, skipped: 'no_sender_phone' }, 200, 'skipped', 'no_sender_phone'],
        ['O07', { received: true, skipped: 'contact_upsert_failed' }, 200, 'failed', 'contact_upsert_failed'],
        ['O08', { received: true, skipped: 'conversation_create_failed' }, 200, 'failed', 'conversation_create_failed'],
        ['O09', { received: true, skipped: 'message_insert_failed' }, 200, 'failed', 'message_insert_failed'],
        ['O10', { received: true, error_logged: true }, 200, 'failed', 'unhandled_error'],
        ['O11', { success: true }, 200, 'processed', 'ok'],
        ['O12', { success: true, type: 'echo_no_recipient' }, 200, 'skipped', 'echo_no_recipient'],
        ['O13', null, 200, 'processed', 'ok'],
        ['O14', { error: 'x' }, 500, 'failed', 'http_500'],
        ['O15', 'text', 200, 'processed', 'ok'],
    ] as const)('%s', (_id, body, status, journalStatus, outcome) => {
        expect(outcomeFromResponseBody(body, status)).toEqual({ status: journalStatus, outcome });
    });
});

describe('providerMessageId', () => {
    it.each([
        ['P01', 'msg91', { uuid: 'u-1', requestId: 'r-1' }, 'u-1'],
        ['P02', 'msg91', { requestId: 12345 }, '12345'],
        ['P03', 'msg91', { uuid: '  ' }, null],
        ['P04', 'msg91', 'x', null],
        ['P05', 'meta', metaValue({ messages: [{ id: 'wamid.A' }] }), 'wamid.A'],
        ['P06', 'meta', metaValue({ statuses: [{ id: 'wamid.S' }] }), 'wamid.S'],
        ['P07', 'meta', { entry: [] }, null],
        ['P08', 'meta', {}, null],
    ] as const)('%s', (_id, provider, payload, expected) => {
        expect(providerMessageId(provider as WebhookProvider, payload)).toBe(expected);
    });
});

describe('isStatusOnlyPayload', () => {
    it.each([
        ['T01', 'msg91', { status: 'Delivered', uuid: 'u' }, true],
        ['T02', 'msg91', { eventName: 'read', uuid: 'u', content: '' }, true],
        ['T03', 'msg91', { webhookType: 3, uuid: 'u' }, true],
        ['T04', 'msg91', { status: 'sent', content: 'Hi sir' }, false],
        ['T05', 'msg91', BASE, false],
        ['T06', 'meta', metaValue({ statuses: [{ id: 'wamid.S', status: 'read' }] }), true],
        ['T07', 'meta', metaValue({ statuses: [{ id: 'wamid.S' }], messages: [{ id: 'wamid.A' }] }), false],
    ] as const)('%s', (_id, provider, payload, expected) => {
        expect(isStatusOnlyPayload(provider as WebhookProvider, payload)).toBe(expected);
    });
});

const journalRow = (over: Partial<JournalRow> = {}): JournalRow => ({
    id: 1, provider: 'msg91', payload: BASE, journal_status: 'received', outcome: null,
    replay_count: 0, last_replay_at: null, created_at: ago(10 * MIN), ...over,
});

describe('decideJournalRow', () => {
    it.each([
        ['R01', { journal_status: 'failed', outcome: 'conversation_create_failed', payload: NO_UUID }, 'replay'],
        ['R02', { journal_status: 'failed', outcome: 'unhandled_error' }, 'replay'],
        ['R03', { journal_status: 'failed', outcome: 'unhandled_error', payload: { customerNumber: '919845012345', content: 'x' } }, 'abandon_no_provider_id'],
        ['R04', {}, 'replay'],
        ['R05', { created_at: ago(MIN) }, 'wait'],
        ['R06', { payload: { status: 'read', uuid: 'u' } }, 'abandon_status_only'],
        ['R07', { journal_status: 'failed', outcome: 'message_insert_failed', replay_count: 3 }, 'wait'],
        ['R08', { journal_status: 'replaying', last_replay_at: ago(MIN) }, 'wait'],
        ['R09', { journal_status: 'replaying', last_replay_at: ago(10 * MIN), created_at: ago(20 * MIN) }, 'replay'],
        ['R10', { payload: { _unparseable: true, raw: '…' } }, 'abandon_unparseable'],
        ['R11', { journal_status: 'processed', outcome: 'stored' }, 'wait'],
        ['R12', { journal_status: 'failed', outcome: 'unhandled_error', created_at: ago(49 * 60 * MIN) }, 'wait'],
    ] as const)('%s', (_id, over, expected) => {
        expect(decideJournalRow(journalRow(over as Partial<JournalRow>), NOW)).toBe(expected);
    });

    it('waits on a provider it does not know', () => {
        expect(decideJournalRow(journalRow({ provider: 'gupshup' }), NOW)).toBe('wait');
    });

    it('keeps an unparseable body as a marked object', () => {
        expect(parseJournalPayload('{"a":1}')).toEqual({ a: 1 });
        expect(parseJournalPayload('not json')).toEqual({ _unparseable: true, raw: 'not json' });
    });
});

const webhookRequest = (body: unknown = BASE) => new NextRequest('http://localhost/api/whatsapp/webhooks/msg91', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const journalRows = (): Row[] => fakeStore.tables.webhook_debug ?? [];

function spec(over: Partial<Parameters<typeof runJournaledWebhook>[0]> = {}) {
    return {
        provider: 'msg91' as const,
        request: webhookRequest(),
        authenticate: vi.fn(async () => ACCEPT),
        reject: vi.fn(() => NextResponse.json({ received: true, skipped: 'auth_failed' }, { status: 200 })),
        process: vi.fn(async () => NextResponse.json({ success: true, conversationId: 'c' })),
        ...over,
    };
}

describe('runJournaledWebhook', () => {
    it('J01 opens a received row and closes it with the outcome', async () => {
        await runJournaledWebhook(spec());
        const [insert] = callsOf(fakeStore, 'webhook_debug', 'insert');
        expect(insert.payload).toMatchObject({ provider: 'msg91', journal_status: 'received', auth_result: 'no_secret', payload: BASE });
        expect(journalRows()).toHaveLength(1);
        expect(journalRows()[0]).toMatchObject({ journal_status: 'processed', outcome: 'stored', auth_result: 'no_secret' });
        expect(typeof journalRows()[0].processed_at).toBe('string');
    });

    it('J02 records the direction the handler classified', async () => {
        let noted: boolean | null = null;
        await runJournaledWebhook(spec({
            process: vi.fn(async () => {
                noted = noteClassifiedDirection('inbound');
                return NextResponse.json({ success: true, conversationId: 'c' });
            }),
        }));
        expect(noted).toBe(true);
        expect(journalRows()[0].classified_direction).toBe('inbound');
    });

    it('J03 rejects without processing and journals the rejection', async () => {
        const run = spec({ authenticate: vi.fn(async () => MISMATCH) });
        const response = await runJournaledWebhook(run);
        expect(run.reject).toHaveBeenCalledWith(MISMATCH);
        expect(run.process).not.toHaveBeenCalled();
        expect(await response.json()).toEqual({ received: true, skipped: 'auth_failed' });
        expect(journalRows()[0]).toMatchObject({ journal_status: 'rejected', outcome: 'auth_mismatch', auth_result: 'mismatch' });
        expect(typeof journalRows()[0].processed_at).toBe('string');
    });

    it('J04 writes nothing when WA_WEBHOOK_DEBUG=false', async () => {
        vi.stubEnv('WA_WEBHOOK_DEBUG', 'false');
        let noted: boolean | null = null;
        const run = spec({
            process: vi.fn(async () => {
                noted = noteClassifiedDirection('inbound');
                return NextResponse.json({ success: true });
            }),
        });
        await runJournaledWebhook(run);
        expect(run.process).toHaveBeenCalledTimes(1);
        expect(noted).toBe(false);
        expect(journalRows()).toHaveLength(0);
    });

    it('J05 turns the journal off for 10 minutes when 017c is missing', async () => {
        fakeStore.failNext['webhook_debug.insert'] = { code: 'PGRST204' };
        const first = spec();
        const response = await runJournaledWebhook(first);
        expect(first.process).toHaveBeenCalledTimes(1);
        expect(await response.json()).toEqual({ success: true, conversationId: 'c' });
        await runJournaledWebhook(spec());
        expect(callsOf(fakeStore, 'webhook_debug', 'insert')).toHaveLength(1);
    });

    it('J06 answers 200 error_logged and journals failed when the handler throws', async () => {
        const response = await runJournaledWebhook(spec({ process: vi.fn(async () => { throw new Error('boom'); }) }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ received: true, error_logged: true });
        expect(journalRows()[0]).toMatchObject({ journal_status: 'failed', outcome: 'unhandled_error' });
    });

    it('J07 fails open when authenticate throws', async () => {
        const run = spec({ authenticate: vi.fn(async () => { throw new Error('boom'); }) });
        await runJournaledWebhook(run);
        expect(run.process).toHaveBeenCalledTimes(1);
        expect(journalRows()).toHaveLength(0);
    });

    it('J08 returns the processor\'s own response object', async () => {
        const own = NextResponse.json({ success: true, conversationId: 'c' });
        expect(await runJournaledWebhook(spec({ process: vi.fn(async () => own) }))).toBe(own);
    });
});

describe('replayJournal', () => {
    const seed = (rows: Array<Partial<JournalRow>>) => {
        fakeStore.tables.webhook_debug = rows.map((over, index) => ({
            ...journalRow({ id: index + 1, ...over }), classified_direction: null, auth_result: 'no_secret', processed_at: null,
        }));
        fakeStore.nextId = 100;
    };
    const handlerReturning = (body: unknown, authenticate = vi.fn(async () => ACCEPT)) =>
        vi.fn((request: NextRequest) => runJournaledWebhook({
            provider: 'msg91', request, authenticate,
            reject: () => NextResponse.json({ received: true, skipped: 'auth_failed' }),
            process: async (req) => {
                await req.json();
                return NextResponse.json(body);
            },
        }));
    const run = (handlers: { msg91?: ReturnType<typeof vi.fn>; meta?: ReturnType<typeof vi.fn> }, budgetMs?: number) =>
        replayJournal({
            handlers: { msg91: handlers.msg91 ?? vi.fn(), meta: handlers.meta ?? vi.fn() } as Parameters<typeof replayJournal>[0]['handlers'],
            now: () => NOW, budgetMs,
        });

    it('RP01 throws JournalNotInstalledError when 017c is missing', async () => {
        fakeStore.failNext['webhook_debug.select'] = { code: '42703' };
        await expect(run({})).rejects.toBeInstanceOf(JournalNotInstalledError);
    });

    it('RP02 replays a failed row; the handler closes it without a new row or an auth check', async () => {
        seed([{ journal_status: 'failed', outcome: 'conversation_create_failed' }]);
        const authenticate = vi.fn(async () => ACCEPT);
        const msg91 = handlerReturning({ success: true, conversationId: 'c' }, authenticate);
        expect(await run({ msg91 })).toEqual({ scanned: 1, replayed: 1, failed: 0 });
        expect(journalRows()[0]).toMatchObject({ journal_status: 'processed', outcome: 'stored', replay_count: 1 });
        expect(callsOf(fakeStore, 'webhook_debug', 'insert')).toHaveLength(0);
        expect(authenticate).not.toHaveBeenCalled();
    });

    it('RP03 counts a replay that fails again', async () => {
        seed([{ journal_status: 'failed', outcome: 'conversation_create_failed' }]);
        const msg91 = handlerReturning({ received: true, skipped: 'conversation_create_failed' });
        expect(await run({ msg91 })).toEqual({ scanned: 1, replayed: 0, failed: 1 });
        expect(journalRows()[0]).toMatchObject({ journal_status: 'failed', replay_count: 1 });
    });

    it('RP04 skips a row another run claimed first', async () => {
        seed([{ journal_status: 'failed', outcome: 'conversation_create_failed' }]);
        fakeStore.failNext['webhook_debug.update'] = { empty: true };
        const msg91 = handlerReturning({ success: true, conversationId: 'c' });
        expect(await run({ msg91 })).toEqual({ scanned: 1, replayed: 0, failed: 0 });
        expect(msg91).not.toHaveBeenCalled();
    });

    it('RP05 abandons a status-only row without calling the handler', async () => {
        seed([{ payload: { status: 'read', uuid: 'u' } }]);
        const msg91 = handlerReturning({ success: true });
        expect(await run({ msg91 })).toEqual({ scanned: 1, replayed: 0, failed: 0 });
        expect(journalRows()[0]).toMatchObject({ journal_status: 'abandoned', outcome: 'status_only' });
        expect(msg91).not.toHaveBeenCalled();
    });

    it('RP06 routes a meta row to the meta handler with the stored payload as the body', async () => {
        const payload = { object: 'whatsapp_business_account', ...metaValue({ messages: [{ id: 'wamid.A' }] }) };
        seed([{ provider: 'meta', payload }]);
        let body: unknown = null;
        const meta = vi.fn(async (request: NextRequest) => {
            body = await request.json();
            return NextResponse.json({ success: true });
        });
        const msg91 = vi.fn();
        expect(await run({ msg91, meta })).toEqual({ scanned: 1, replayed: 1, failed: 0 });
        expect(meta).toHaveBeenCalledTimes(1);
        expect(msg91).not.toHaveBeenCalled();
        expect(body).toEqual(payload);
    });

    it('RP07 stops at once when the budget is spent', async () => {
        seed([{}, {}]);
        const msg91 = handlerReturning({ success: true });
        await run({ msg91 }, 0);
        expect(msg91).not.toHaveBeenCalled();
    });

    it('RP08 counts a throwing handler as failed and carries on', async () => {
        seed([{}, {}]);
        const msg91 = vi.fn()
            .mockImplementationOnce(async () => { throw new Error('boom'); })
            .mockImplementationOnce(async () => NextResponse.json({ success: true, conversationId: 'c' }));
        expect(await run({ msg91 })).toEqual({ scanned: 2, replayed: 1, failed: 1 });
        expect(msg91).toHaveBeenCalledTimes(2);
    });
});
