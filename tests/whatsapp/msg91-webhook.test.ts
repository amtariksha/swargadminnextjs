import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const notifyStaffInbound = vi.hoisted(() => vi.fn());
vi.mock('@/lib/whatsapp/supabase', async () => {
    const { fakeSupabase } = await import('./fake-supabase');
    return { supabaseAdmin: fakeSupabase, supabase: fakeSupabase };
});
vi.mock('@/lib/whatsapp/staff-notify', () => ({ notifyStaffInbound }));
vi.mock('@/lib/lms/leads/whatsapp-intake', () => ({ maybeCreateWhatsAppLead: vi.fn(async () => undefined) }));

import { POST } from '@/app/api/whatsapp/webhooks/msg91/route';
import { clearWebhookAuthCache } from '@/lib/whatsapp/webhook-auth';
import { clearWebhookJournalState } from '@/lib/whatsapp/webhook-journal';
import { callsOf, fakeStore, raceInsert, resetFakeStore, type Row } from './fake-supabase';

const BASE = { customerNumber: '919845012345', integratedNumber: '917090166111', content: 'Milk was sour', uuid: 'u-1', customerName: 'Ravi' };
const NUMBERS = [{ number: '917090166111', active: true }, { number: '917996196111', active: true }];
const CONTACT = { id: 'contact-ravi', name: 'Ravi', phone: '919845012345', created_at: '2026-10-01T00:00:00.000Z' };
const OUTBOUND = { ...BASE, direction: '1', eventName: 'submitted' };
const SECRET = { key: 'msg91_webhook_secret', value: 's3cret', org_id: null };

function webhook(body: unknown, options: { header?: string; query?: string } = {}): NextRequest {
    const url = new URL('http://localhost/api/whatsapp/webhooks/msg91');
    if (options.query !== undefined) url.searchParams.set('secret', options.query);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.header !== undefined) headers['x-swarg-webhook-secret'] = options.header;
    return new NextRequest(url, { method: 'POST', headers, body: JSON.stringify(body) });
}
async function call(body: unknown, options?: { header?: string; query?: string }) {
    const response = await POST(webhook(body, options));
    return { status: response.status, json: await response.json() };
}
const rows = (table: string): Row[] => fakeStore.tables[table] ?? [];
const journal = (): Row[] => rows('webhook_debug').filter((row) => row.journal_status !== null);
const conversationAt = (id: string, createdAt: string, over: Row = {}): Row => ({
    id, contact_id: CONTACT.id, integrated_number: '917090166111', status: 'open', unread_count: 0,
    created_at: createdAt, last_message: 'old', ...over,
});

beforeEach(() => {
    clearWebhookAuthCache();
    clearWebhookJournalState();
    resetFakeStore({ integrated_numbers: NUMBERS.map((row) => ({ ...row })) });
    notifyStaffInbound.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('MSG91 webhook (through POST)', () => {
    it('W01 stores a first inbound message and journals it', async () => {
        const { status, json } = await call(BASE);
        expect(status).toBe(200);
        expect(json).toEqual({ success: true, conversationId: rows('conversations')[0].id });
        expect(rows('contacts')).toHaveLength(1);
        expect(rows('contacts')[0]).toMatchObject({ name: 'Ravi', phone: '919845012345' });
        expect(rows('conversations')).toHaveLength(1);
        expect(rows('conversations')[0]).toMatchObject({ status: 'open', unread_count: 1, integrated_number: '917090166111' });
        expect(rows('messages')).toHaveLength(1);
        expect(rows('messages')[0]).toMatchObject({ direction: 'inbound', status: 'delivered', source: 'customer', external_id: 'u-1' });
        expect(journal()).toHaveLength(1);
        expect(journal()[0]).toMatchObject({
            journal_status: 'processed', outcome: 'stored', auth_result: 'no_secret', classified_direction: 'inbound',
        });
        expect(rows('webhook_debug')).toHaveLength(1);
        expect(notifyStaffInbound).toHaveBeenCalledTimes(1);
    });

    it('W02 uses the racing conversation and still bumps its unread count', async () => {
        fakeStore.tables.contacts = [{ ...CONTACT }];
        raceInsert(fakeStore, 'conversations', conversationAt('conv-race', '2026-10-20T05:59:59.000Z', { unread_count: 1 }));
        const { json } = await call(BASE);
        expect(json).toEqual({ success: true, conversationId: 'conv-race' });
        expect(rows('conversations')).toHaveLength(1);
        expect(rows('conversations')[0]).toMatchObject({ id: 'conv-race', unread_count: 2, status: 'open' });
        expect(rows('messages')[0].conversation_id).toBe('conv-race');
        expect(notifyStaffInbound).not.toHaveBeenCalled();
    });

    it('W03 uses the racing contact', async () => {
        raceInsert(fakeStore, 'contacts', { ...CONTACT, id: 'contact-race' });
        const { json } = await call(BASE);
        expect(json.success).toBe(true);
        expect(rows('contacts')).toHaveLength(1);
        expect(rows('conversations')[0].contact_id).toBe('contact-race');
    });

    it('W04 drops nothing silently: a failed conversation insert is journalled failed', async () => {
        fakeStore.failNext['conversations.insert'] = { code: '23502' };
        const { status, json } = await call(BASE);
        expect(status).toBe(200);
        expect(json).toEqual({ received: true, skipped: 'conversation_create_failed' });
        expect(rows('messages')).toHaveLength(0);
        expect(journal()[0]).toMatchObject({ journal_status: 'failed', outcome: 'conversation_create_failed' });
    });

    it('W05 skips a duplicate event before any contact or conversation write', async () => {
        fakeStore.tables.messages = [{ id: 'm-1', external_id: 'u-1', direction: 'inbound', conversation_id: 'conv-1' }];
        const { json } = await call(BASE);
        expect(json).toEqual({ success: true, type: 'duplicate_skipped' });
        expect(callsOf(fakeStore, 'contacts')).toHaveLength(0);
        expect(callsOf(fakeStore, 'conversations')).toHaveLength(0);
        expect(journal()[0]).toMatchObject({ journal_status: 'skipped', outcome: 'duplicate_skipped' });
    });

    it('W06 does not create a contact for an outbound echo to an unknown number', async () => {
        const { json } = await call(OUTBOUND);
        expect(json).toEqual({ received: true, skipped: 'outbound_no_existing_contact' });
        expect(rows('contacts')).toHaveLength(0);
    });

    it('W07 does not create a conversation for an outbound echo (find only)', async () => {
        fakeStore.tables.contacts = [{ ...CONTACT }];
        const { json } = await call(OUTBOUND);
        expect(json).toEqual({ received: true, skipped: 'outbound_no_existing_conversation' });
        expect(callsOf(fakeStore, 'conversations', 'insert')).toHaveLength(0);
    });

    it('W08 drops a wrong shared secret with 200 auth_failed', async () => {
        fakeStore.tables.app_settings = [{ ...SECRET }];
        const { status, json } = await call(BASE, { header: 'wrong' });
        expect(status).toBe(200);
        expect(json).toEqual({ received: true, skipped: 'auth_failed' });
        expect(rows('contacts')).toHaveLength(0);
        expect(rows('messages')).toHaveLength(0);
        expect(journal()[0]).toMatchObject({ journal_status: 'rejected', auth_result: 'mismatch', outcome: 'auth_mismatch' });
    });

    it('W09 accepts the secret carried in the query string', async () => {
        fakeStore.tables.app_settings = [{ ...SECRET }];
        const { json } = await call(BASE, { query: 's3cret' });
        expect(json.success).toBe(true);
        expect(rows('messages')).toHaveLength(1);
        expect(journal()[0]).toMatchObject({ journal_status: 'processed', auth_result: 'ok' });
    });

    it('W10 drops a call that carries no secret once one is set', async () => {
        fakeStore.tables.app_settings = [{ ...SECRET }];
        const { json } = await call(BASE);
        expect(json).toEqual({ received: true, skipped: 'auth_failed' });
        expect(journal()[0]).toMatchObject({ journal_status: 'rejected', auth_result: 'missing' });
    });

    it('W11 falls back to the plain debug capture when the journal is not installed', async () => {
        fakeStore.failNext['webhook_debug.insert'] = { code: 'PGRST204' };
        const { json } = await call(BASE);
        expect(json.success).toBe(true);
        expect(rows('messages')).toHaveLength(1);
        expect(rows('webhook_debug')).toHaveLength(1);
        expect(rows('webhook_debug')[0]).toMatchObject({ provider: 'msg91', payload: BASE, classified_direction: 'inbound', journal_status: null });
    });

    it('W12 appends to the oldest of two duplicate conversations', async () => {
        fakeStore.tables.contacts = [{ ...CONTACT }];
        fakeStore.tables.conversations = [
            conversationAt('conv-b', '2026-10-02T00:00:00.000Z'),
            conversationAt('conv-a', '2026-10-01T00:00:00.000Z'),
        ];
        const { json } = await call(BASE);
        expect(json).toEqual({ success: true, conversationId: 'conv-a' });
        expect(rows('messages')[0].conversation_id).toBe('conv-a');
    });

    it('W13 writes no webhook_debug row when WA_WEBHOOK_DEBUG=false', async () => {
        vi.stubEnv('WA_WEBHOOK_DEBUG', 'false');
        const { json } = await call(BASE);
        expect(json.success).toBe(true);
        expect(rows('messages')).toHaveLength(1);
        expect(rows('webhook_debug')).toHaveLength(0);
    });
});
