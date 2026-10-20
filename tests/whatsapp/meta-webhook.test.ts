import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

vi.mock('@/lib/whatsapp/supabase', async () => {
    const { fakeSupabase } = await import('./fake-supabase');
    return { supabaseAdmin: fakeSupabase, supabase: fakeSupabase };
});
vi.mock('@/lib/whatsapp/staff-notify', () => ({ notifyStaffInbound: vi.fn() }));
vi.mock('@/lib/lms/leads/whatsapp-intake', () => ({ maybeCreateWhatsAppLead: vi.fn(async () => undefined) }));

import { POST } from '@/app/api/whatsapp/webhooks/meta/route';
import { clearWebhookAuthCache } from '@/lib/whatsapp/webhook-auth';
import { clearWebhookJournalState } from '@/lib/whatsapp/webhook-journal';
import { fakeStore, raceInsert, resetFakeStore, type Row } from './fake-supabase';

const SECRET = 'topsecret';
const PROVIDER_TS = '1760940000';
const META = (id: string) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
        metadata: { phone_number_id: 'PNID', display_phone_number: '91 70901 66111' },
        contacts: [{ profile: { name: 'Ravi' } }],
        messages: [{ id, from: '919845012345', type: 'text', timestamp: PROVIDER_TS, text: { body: 'Hi' } }],
    } }] }],
});
const CONTACT = { id: 'contact-ravi', name: 'Ravi', phone: '919845012345', created_at: '2026-10-01T00:00:00.000Z' };

const sign = (raw: string) => 'sha256=' + createHmac('sha256', SECRET).update(raw).digest('hex');
async function call(body: unknown, signature: string | null | 'valid' = 'valid') {
    const raw = JSON.stringify(body);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (signature !== null) headers['x-hub-signature-256'] = signature === 'valid' ? sign(raw) : signature;
    const response = await POST(new NextRequest('http://localhost/api/whatsapp/webhooks/meta', { method: 'POST', headers, body: raw }));
    return { status: response.status, json: await response.json() };
}
const rows = (table: string): Row[] => fakeStore.tables[table] ?? [];
const journal = (): Row => rows('webhook_debug')[0];

beforeEach(() => {
    clearWebhookAuthCache();
    clearWebhookJournalState();
    resetFakeStore({ integrated_numbers: [{ number: '917090166111', meta_phone_number_id: 'PNID', active: true }] });
    vi.stubEnv('FACEBOOK_APP_SECRET', SECRET);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('Meta webhook (through POST)', () => {
    it('MR01 rejects a wrong signature with 401 and journals the rejection', async () => {
        const { status, json } = await call(META('wamid.A'), 'sha256=00');
        expect(status).toBe(401);
        expect(json).toEqual({ error: 'Invalid signature' });
        expect(rows('messages')).toHaveLength(0);
        expect(journal()).toMatchObject({ provider: 'meta', journal_status: 'rejected', auth_result: 'mismatch' });
    });

    it('MR02 stores a signed inbound message with the provider timestamp', async () => {
        const { status, json } = await call(META('wamid.A'));
        expect(status).toBe(200);
        expect(json).toEqual({ success: true });
        expect(rows('messages')).toHaveLength(1);
        expect(rows('messages')[0]).toMatchObject({
            direction: 'inbound', status: 'received', external_id: 'wamid.A',
            created_at: new Date(Number(PROVIDER_TS) * 1000).toISOString(),
        });
        expect(journal()).toMatchObject({ journal_status: 'processed', outcome: 'ok', auth_result: 'ok' });
    });

    it('MR03 accepts a missing signature header in report-only mode', async () => {
        const { json } = await call(META('wamid.A'), null);
        expect(json).toEqual({ success: true });
        expect(rows('messages')).toHaveLength(1);
        expect(journal()).toMatchObject({ auth_result: 'missing', journal_status: 'processed' });
    });

    it('MR04 uses the racing conversation and bumps its unread count', async () => {
        fakeStore.tables.contacts = [{ ...CONTACT }];
        raceInsert(fakeStore, 'conversations', {
            id: 'conv-race', contact_id: CONTACT.id, integrated_number: '917090166111', status: 'open',
            unread_count: 1, created_at: '2026-10-20T05:59:59.000Z',
        });
        await call(META('wamid.A'));
        expect(rows('conversations')).toHaveLength(1);
        expect(rows('conversations')[0]).toMatchObject({ id: 'conv-race', unread_count: 2 });
        expect(rows('messages')[0].conversation_id).toBe('conv-race');
    });

    it('MR05 reports a failed message insert so the journal can replay it', async () => {
        fakeStore.failNext['messages.insert'] = { code: '23514' };
        const { status, json } = await call(META('wamid.A'));
        expect(status).toBe(200);
        expect(json).toEqual({ received: true, skipped: 'message_insert_failed' });
        expect(journal()).toMatchObject({ journal_status: 'failed', outcome: 'message_insert_failed' });
    });

    it('MR06 accepts every call while FACEBOOK_APP_SECRET is unset', async () => {
        vi.stubEnv('FACEBOOK_APP_SECRET', '');
        const { json } = await call(META('wamid.A'), 'sha256=00');
        expect(json).toEqual({ success: true });
        expect(journal()).toMatchObject({ auth_result: 'no_secret', journal_status: 'processed' });
    });

    it('MR07 answers 200 error_logged when the contact cannot be created', async () => {
        fakeStore.failNext['contacts.insert'] = { code: '23502' };
        const { status, json } = await call(META('wamid.A'));
        expect(status).toBe(200);
        expect(json).toEqual({ received: true, error_logged: true });
        expect(journal()).toMatchObject({ journal_status: 'failed', outcome: 'unhandled_error' });
    });
});
