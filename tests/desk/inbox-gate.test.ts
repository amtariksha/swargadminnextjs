import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { evaluateInboxAccess, reportInboxAccess, resetInboxGateLogForTests } from '@/lib/desk/inbox-gate';
import { resetWhoamiCacheForTests } from '@/lib/desk/whoami';

const T0 = Date.parse('2026-10-20T06:00:00.000Z');
const fetchMock = vi.fn();
let warn: ReturnType<typeof vi.spyOn>;

const OK = (over: Record<string, unknown> = {}): Response =>
    new Response(JSON.stringify({
        response: 200, status: true, message: 'successfully',
        data: { user: { id: 1234, name: 'Asha' }, agent: true, manager: false, money: true, inbox: true, via: 'permission', ...over },
    }), { status: 200 });
const CUSTOMER = { user: { id: 501, name: 'C' }, agent: false, money: false, inbox: false, via: 'none' };
const lines = (): string[] => warn.mock.calls.map((call: unknown[]) => String(call[0]));

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    resetWhoamiCacheForTests();
    resetInboxGateLogForTests();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('evaluateInboxAccess', () => {
    it('G01 allows a caller with the inbox right without logging', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(OK()));
        expect(await evaluateInboxAccess('Bearer staff', 'conversations.list')).toBe('allowed');
        expect(lines()).toEqual([]);
    });

    it('G02 to G05 log a denial once per route and user per five minutes', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(OK(CUSTOMER)));
        expect(await evaluateInboxAccess('Bearer cust', 'conversations.list')).toBe('would_deny');
        expect(lines()).toEqual([
            '[desk-inbox-gate] report_only would_deny route=conversations.list reason=no_inbox_right user=501 via=none',
        ]);
        await evaluateInboxAccess('Bearer cust', 'conversations.list');
        expect(lines()).toHaveLength(1);
        await evaluateInboxAccess('Bearer cust', 'chat.send');
        expect(lines()).toHaveLength(2);
        vi.setSystemTime(T0 + 5 * 60_000);
        await evaluateInboxAccess('Bearer cust', 'conversations.list');
        expect(lines()).toHaveLength(3);
    });

    it('G06 reports a rejected token by a hash prefix, never the token', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 401 })));
        expect(await evaluateInboxAccess('Bearer secret-token', 'conversations.patch')).toBe('would_deny');
        expect(lines()[0]).toMatch(/^\[desk-inbox-gate\] report_only would_deny route=conversations\.patch reason=token_rejected user=token:[0-9a-f]{8} via=none$/);
        expect(lines()[0]).not.toContain('secret-token');
    });

    it('G07 marks an unreachable backend as unverified and a missing header as skipped', async () => {
        fetchMock.mockImplementation(() => Promise.reject(new Error('down')));
        expect(await evaluateInboxAccess('Bearer abc123', 'conversations.get')).toBe('unverified');
        expect(lines()).toEqual(['[desk-inbox-gate] report_only unverified route=conversations.get reason=authz_unavailable']);
        expect(await evaluateInboxAccess(null, 'conversations.get')).toBe('skipped');
        expect(lines().join('\n')).not.toMatch(/Bearer|abc123/);
    });
});

describe('reportInboxAccess', () => {
    it('G08 never throws and returns nothing', () => {
        fetchMock.mockImplementation(() => { throw new Error('sync failure'); });
        const request = new NextRequest('http://localhost/api/whatsapp/conversations', { headers: { authorization: 'Bearer x' } });
        expect(reportInboxAccess(request, 'chat.send')).toBeUndefined();
        const broken = { headers: null } as unknown as Request;
        expect(reportInboxAccess(broken, 'chat.send')).toBeUndefined();
    });
});
