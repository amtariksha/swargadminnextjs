import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/whatsapp/supabase', async () => {
    const { fakeSupabase } = await import('./fake-supabase');
    return { supabaseAdmin: fakeSupabase, supabase: fakeSupabase };
});

import {
    checkMetaSignature, checkMsg91Secret, clearWebhookAuthCache, decideMetaSignature, decideSharedSecret,
    META_SIGNATURE_HEADER_REQUIRED,
} from '@/lib/whatsapp/webhook-auth';
import { clearWebhookJournalState } from '@/lib/whatsapp/webhook-journal';
import { callsOf, fakeStore, resetFakeStore } from './fake-supabase';

const RAW = '{"object":"whatsapp_business_account"}';
const VALID = 'sha256=4818e604996da0da267d1e9f0886199c1062a61ec3a96c4de5d6b07dd59f6af5';
const SECRET_ROW = { key: 'msg91_webhook_secret', value: 's3cret', org_id: null };

function msg91Request(options: { header?: string; query?: string } = {}): NextRequest {
    const url = new URL('http://localhost/api/whatsapp/webhooks/msg91');
    if (options.query !== undefined) url.searchParams.set('secret', options.query);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.header !== undefined) headers['x-swarg-webhook-secret'] = options.header;
    return new NextRequest(url, { method: 'POST', headers, body: '{}' });
}

beforeEach(() => {
    clearWebhookAuthCache();
    clearWebhookJournalState();
    resetFakeStore();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('decideSharedSecret', () => {
    it.each([
        ['S01', '', null, 'no_secret', true, false],
        ['S02', '', 'abc', 'no_secret', true, true],
        ['S03', '   ', null, 'no_secret', true, false],
        ['S04', 's3cret', 's3cret', 'ok', true, true],
        ['S05', 's3cret', ' s3cret ', 'ok', true, true],
        ['S06', 's3cret', null, 'missing', false, false],
        ['S07', 's3cret', '', 'missing', false, false],
        ['S08', 's3cret', 's3cre', 'mismatch', false, true],
        ['S09', 's3cret', 'S3CRET', 'mismatch', false, true],
    ] as const)('%s', (_id, configured, carried, result, accept, wasCarried) => {
        expect(decideSharedSecret(configured, carried)).toEqual({ result, accept, carried: wasCarried });
    });
});

describe('decideMetaSignature', () => {
    it.each([
        ['M01', '', null, false, RAW, 'no_secret', true],
        ['M02', '', VALID, false, RAW, 'no_secret', true],
        ['M03', 'topsecret', VALID, false, RAW, 'ok', true],
        ['M04', 'topsecret', 'sha256=00', false, RAW, 'mismatch', false],
        ['M05', 'topsecret', null, false, RAW, 'missing', true],
        ['M06', 'topsecret', null, true, RAW, 'missing', false],
        ['M07', 'topsecret', VALID, false, '{"object": "whatsapp_business_account"}', 'mismatch', false],
    ] as const)('%s', (_id, appSecret, header, requireHeader, rawBody, result, accept) => {
        const verdict = decideMetaSignature({ appSecret, header, rawBody, requireHeader });
        expect(verdict).toMatchObject({ result, accept });
    });

    it('marks a carried header, including when no secret is configured (M02)', () => {
        expect(decideMetaSignature({ appSecret: '', header: VALID, rawBody: RAW, requireHeader: false }).carried).toBe(true);
        expect(decideMetaSignature({ appSecret: 'topsecret', header: null, rawBody: RAW, requireHeader: false }).carried).toBe(false);
    });

    it('ships with the missing header in report-only mode (R-D2)', () => {
        expect(META_SIGNATURE_HEADER_REQUIRED).toBe(false);
    });
});

describe('checkMsg91Secret', () => {
    it('takes the header over the query parameter', async () => {
        fakeStore.tables.app_settings = [{ ...SECRET_ROW }];
        expect(await checkMsg91Secret(msg91Request({ header: 's3cret', query: 'wrong' }))).toMatchObject({ result: 'ok' });
        expect(await checkMsg91Secret(msg91Request({ header: 'wrong', query: 's3cret' }))).toMatchObject({ result: 'mismatch' });
    });

    it('accepts a query-only carrier and rejects a missing one', async () => {
        fakeStore.tables.app_settings = [{ ...SECRET_ROW }];
        expect(await checkMsg91Secret(msg91Request({ query: 's3cret' }))).toEqual({ result: 'ok', accept: true, carried: true });
        expect(await checkMsg91Secret(msg91Request())).toEqual({ result: 'missing', accept: false, carried: false });
    });

    it('finds the secret on an org row as well as on the global row', async () => {
        fakeStore.tables.app_settings = [{ ...SECRET_ROW, org_id: '00000000-0000-0000-0000-000000000001' }];
        expect(await checkMsg91Secret(msg91Request({ header: 's3cret' }))).toMatchObject({ result: 'ok' });
    });

    it('caches the setting for 60 seconds', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-20T06:00:00.000Z'));
        fakeStore.tables.app_settings = [{ ...SECRET_ROW }];
        await checkMsg91Secret(msg91Request({ header: 's3cret' }));
        const reads = callsOf(fakeStore, 'app_settings', 'select').length;
        expect(reads).toBeGreaterThan(0);
        vi.setSystemTime(new Date('2026-10-20T06:00:59.000Z'));
        await checkMsg91Secret(msg91Request({ header: 's3cret' }));
        expect(callsOf(fakeStore, 'app_settings', 'select')).toHaveLength(reads);
        vi.setSystemTime(new Date('2026-10-20T06:01:01.000Z'));
        await checkMsg91Secret(msg91Request({ header: 's3cret' }));
        expect(callsOf(fakeStore, 'app_settings', 'select').length).toBeGreaterThan(reads);
    });

    it('treats a settings read error as "no secret" (report-only)', async () => {
        fakeStore.tables.app_settings = [{ ...SECRET_ROW }];
        fakeStore.failNext['app_settings.select'] = { throws: true };
        expect(await checkMsg91Secret(msg91Request({ header: 'wrong' }))).toMatchObject({ result: 'no_secret', accept: true });
    });

    it('logs report-only mode at most once per 10 minutes, without the secret', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        await checkMsg91Secret(msg91Request({ header: 'abc' }));
        await checkMsg91Secret(msg91Request({ header: 'abc' }));
        const lines = log.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('report-only'));
        expect(lines).toEqual(['[MSG91 Webhook] auth=report-only (msg91_webhook_secret not set) carried_secret=yes']);
    });
});

describe('checkMetaSignature', () => {
    const metaRequest = (header?: string) => new NextRequest('http://localhost/api/whatsapp/webhooks/meta', {
        method: 'POST', headers: header ? { 'x-hub-signature-256': header } : {}, body: RAW,
    });

    it('reads FACEBOOK_APP_SECRET and verifies the raw body', async () => {
        vi.stubEnv('FACEBOOK_APP_SECRET', 'topsecret');
        expect(await checkMetaSignature(metaRequest(VALID), RAW)).toMatchObject({ result: 'ok', accept: true });
        expect(await checkMetaSignature(metaRequest('sha256=00'), RAW)).toMatchObject({ result: 'mismatch', accept: false });
        expect(await checkMetaSignature(metaRequest(), RAW)).toMatchObject({ result: 'missing', accept: true });
    });

    it('accepts without a secret and throttles the warning', async () => {
        vi.stubEnv('FACEBOOK_APP_SECRET', '');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(await checkMetaSignature(metaRequest(), RAW)).toMatchObject({ result: 'no_secret', accept: true });
        await checkMetaSignature(metaRequest(), RAW);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
