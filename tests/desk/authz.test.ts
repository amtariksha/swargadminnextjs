import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const settingsState = vi.hoisted(() => ({ ui_enabled: true }));

vi.mock('@/lib/desk/settings', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/desk/settings')>();
    return {
        ...original,
        getDeskSettings: async () => ({ ...original.allOffDeskSettings(), readable: true, ui_enabled: settingsState.ui_enabled }),
    };
});

import { DESK_WRAPPED, deskOk, withDesk } from '@/lib/desk/authz';
import { DeskApiError } from '@/lib/desk/api-error';
import { resetWhoamiCacheForTests, whoamiCacheSizeForTests } from '@/lib/desk/whoami';

const T0 = Date.parse('2026-10-20T06:00:00.000Z');
const MIN = 60_000;
const fetchMock = vi.fn();

const OK = (over: Record<string, unknown> = {}): Response =>
    new Response(JSON.stringify({
        response: 200, status: true, message: 'successfully',
        data: { user: { id: 1234, name: 'Asha' }, agent: true, manager: false, money: true, inbox: true, via: 'permission', ...over },
    }), { status: 200 });
const NONE = { agent: false, manager: false, money: false, inbox: false, via: 'none' };

const echo = withDesk('agent', async (_request, ctx) =>
    deskOk({ actor: ctx.actor, rights: ctx.rights, token: ctx.token, ui: ctx.settings.ui_enabled }));
const route = { params: Promise.resolve({}) } as { params: Promise<Record<string, never>> };

function call(handler: typeof echo, headers: Record<string, string> = { authorization: 'Bearer tok-1' }) {
    return handler(new NextRequest('http://localhost/api/desk/me', { headers }), route);
}
const codeOf = async (response: Response) => (await response.json()).error?.code;

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    resetWhoamiCacheForTests();
    settingsState.ui_enabled = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('withDesk', () => {
    it('W01 answers 401 without a token and never calls the backend', async () => {
        const response = await call(echo, {});
        expect(response.status).toBe(401);
        expect(await codeOf(response)).toBe('unauthorized');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('W02 answers 401 when the backend rejects the token and caches nothing', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 401 })));
        expect((await call(echo)).status).toBe(401);
        expect((await call(echo)).status).toBe(401);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(whoamiCacheSizeForTests()).toBe(0);
    });

    it('W03 takes the actor from whoami and ignores identity headers', async () => {
        vi.stubEnv('SWARG_BACKEND_URL', 'https://backend.test/');
        vi.stubEnv('NEXT_PUBLIC_TENANT_CODE', '');
        fetchMock.mockImplementation(() => Promise.resolve(OK()));
        const response = await call(echo, {
            authorization: 'Bearer tok-1', 'x-user-id': '999', 'x-user-name': 'Mallory', 'x-user-role': 'super_admin',
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.actor).toEqual({ id: '1234', name: 'Asha' });
        expect(body.data.rights).toEqual({ agent: true, manager: false, money: true, inbox: true, via: 'permission' });
        expect(body.data.token).toBe('tok-1');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://backend.test/api/swarg/support/whoami');
        expect(init.headers.Authorization).toBe('Bearer tok-1');
    });

    it('W04 answers 403 when the caller has no right', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(OK(NONE)));
        const response = await call(echo);
        expect(response.status).toBe(403);
        expect(await codeOf(response)).toBe('forbidden');
    });

    it('W05 and W06 gate the manager level on whoami.manager', async () => {
        const manager = withDesk('manager', async () => deskOk({}));
        fetchMock.mockImplementation(() => Promise.resolve(OK()));
        expect((await call(manager)).status).toBe(403);
        resetWhoamiCacheForTests();
        fetchMock.mockImplementation(() => Promise.resolve(OK({ manager: true })));
        expect((await call(manager)).status).toBe(200);
    });

    it('W07 and W08 cache for five minutes', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(OK()));
        await call(echo);
        vi.setSystemTime(T0 + 5 * MIN - 1);
        await call(echo);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        vi.setSystemTime(T0 + 5 * MIN);
        await call(echo);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('W09 and W10 serve a stale allowed entry for at most ten minutes', async () => {
        fetchMock.mockImplementationOnce(() => Promise.resolve(OK()));
        await call(echo);
        fetchMock.mockImplementation(() => Promise.reject(new Error('down')));
        vi.setSystemTime(T0 + 10 * MIN);
        expect((await call(echo)).status).toBe(200);
        vi.setSystemTime(T0 + 10 * MIN + 1);
        const late = await call(echo);
        expect(late.status).toBe(503);
        expect(await codeOf(late)).toBe('authz_unavailable');
    });

    it('W11 never serves a stale denial: 503, not 403', async () => {
        fetchMock.mockImplementationOnce(() => Promise.resolve(OK(NONE)));
        expect((await call(echo)).status).toBe(403);
        fetchMock.mockImplementation(() => Promise.resolve(new Response('x', { status: 500 })));
        vi.setSystemTime(T0 + 6 * MIN);
        const response = await call(echo);
        expect(response.status).toBe(503);
        expect(await codeOf(response)).toBe('authz_unavailable');
    });

    it('W12 does not let an agent entry serve a manager route', async () => {
        const manager = withDesk('manager', async () => deskOk({}));
        fetchMock.mockImplementationOnce(() => Promise.resolve(OK()));
        await call(echo);
        fetchMock.mockImplementation(() => Promise.resolve(new Response('x', { status: 503 })));
        vi.setSystemTime(T0 + 6 * MIN);
        const response = await call(manager);
        expect(response.status).toBe(503);
        expect(await codeOf(response)).toBe('authz_unavailable');
    });

    it.each([
        ['fetch rejects', () => Promise.reject(new Error('down'))],
        ['500', () => Promise.resolve(new Response('x', { status: 500 }))],
        ['429', () => Promise.resolve(new Response('x', { status: 429 }))],
        ['404', () => Promise.resolve(new Response('x', { status: 404 }))],
        ['200 without data.user', () => Promise.resolve(new Response(JSON.stringify({ response: 200, data: { agent: true } }), { status: 200 }))],
        ['200 html', () => Promise.resolve(new Response('<html></html>', { status: 200 }))],
        ['200 response 201', () => Promise.resolve(new Response(JSON.stringify({
            response: 201, data: { user: { id: 1, name: 'A' }, agent: true, manager: false, money: true, inbox: true, via: 'permission' },
        }), { status: 200 }))],
    ])('W13 answers 503 when the backend gives nothing usable (%s)', async (_label, answer) => {
        fetchMock.mockImplementation(answer);
        const response = await call(echo);
        expect(response.status).toBe(503);
        expect(await codeOf(response)).toBe('authz_unavailable');
        expect(whoamiCacheSizeForTests()).toBe(0);
    });

    it('W14 drops the cache entry when the backend later rejects the token', async () => {
        fetchMock.mockImplementationOnce(() => Promise.resolve(OK()));
        await call(echo);
        vi.setSystemTime(T0 + 6 * MIN);
        fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 401 })));
        expect((await call(echo)).status).toBe(401);
        fetchMock.mockImplementation(() => Promise.reject(new Error('down')));
        expect((await call(echo)).status).toBe(503);
    });

    it('W15 to W17 apply the ui flag after the right', async () => {
        settingsState.ui_enabled = false;
        fetchMock.mockImplementation(() => Promise.resolve(OK()));
        const off = await call(echo);
        expect(off.status).toBe(403);
        expect(await codeOf(off)).toBe('ui_disabled');

        const always = withDesk('agent', async (_r, ctx) => deskOk({ ui: ctx.settings.ui_enabled }), { alwaysOn: true });
        const allowed = await call(always);
        expect(allowed.status).toBe(200);
        expect((await allowed.json()).data.ui).toBe(false);

        resetWhoamiCacheForTests();
        fetchMock.mockImplementation(() => Promise.resolve(OK(NONE)));
        expect(await codeOf(await call(echo))).toBe('forbidden');
    });

    it('W18 hides the message of an unexpected error', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(OK()));
        const boom = withDesk('agent', async () => { throw new Error('select * from secret'); });
        const response = await call(boom);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).not.toContain('secret');
        expect(text).toContain('internal_error');
    });

    it('W19 answers a DeskApiError with its code and data', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(OK()));
        const notInstalled = withDesk('agent', async () => { throw new DeskApiError('not_installed', 'x'); });
        expect((await call(notInstalled)).status).toBe(503);
        const conflict = withDesk('agent', async () => {
            throw new DeskApiError('new_customer_message', 'm', { ticket: { id: 'x' }, action: null });
        });
        const response = await call(conflict);
        expect(response.status).toBe(409);
        expect((await response.json()).data).toEqual({ ticket: { id: 'x' }, action: null });
    });

    it('W20 keeps at most 500 entries and evicts the oldest', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(OK()));
        for (let index = 0; index < 501; index += 1) {
            await call(echo, { authorization: `Bearer tok-${index}` });
        }
        expect(whoamiCacheSizeForTests()).toBe(500);
        fetchMock.mockClear();
        await call(echo, { authorization: 'Bearer tok-0' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        fetchMock.mockClear();
        await call(echo, { authorization: 'Bearer tok-500' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('W21 shares one backend call between concurrent requests', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(OK()));
        await Promise.all([call(echo), call(echo), call(echo)]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('W22 marks the wrapped function', () => {
        expect((echo as unknown as Record<symbol, unknown>)[DESK_WRAPPED]).toEqual({ level: 'agent', alwaysOn: false });
    });

    it('W23 rejects a non-bearer authorization header', async () => {
        const response = await call(echo, { authorization: 'Basic abc' });
        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
