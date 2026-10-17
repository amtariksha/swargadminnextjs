import { afterEach, describe, expect, it, vi } from 'vitest';
import { deskFetch } from '@/lib/desk/client';

const fetchMock = vi.fn();
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

function answer(status: number, body: string): void {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(() => Promise.resolve(new Response(body, { status })));
}

describe('deskFetch', () => {
    it('F1 returns an ok envelope unchanged', async () => {
        answer(200, JSON.stringify({ ok: true, data: { a: 1 } }));
        expect(await deskFetch('/api/desk/me')).toEqual({ ok: true, data: { a: 1 } });
    });

    it('F2 returns a failure envelope unchanged', async () => {
        const body = { ok: false, error: { code: 'ui_disabled', message: 'Desk is switched off.' } };
        answer(403, JSON.stringify(body));
        expect(await deskFetch('/api/desk/me')).toEqual(body);
    });

    it('F3 and F4 map the proxy 401 bodies', async () => {
        answer(401, JSON.stringify({ error: 'Unauthorized' }));
        expect(await deskFetch('/api/desk/me')).toEqual({ ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } });
        answer(401, JSON.stringify({ error: 'Invalid or expired token' }));
        expect(await deskFetch('/api/desk/me')).toEqual({ ok: false, error: { code: 'unauthorized', message: 'Invalid or expired token' } });
    });

    it('F5 maps the proxy 500 body', async () => {
        answer(500, JSON.stringify({ error: 'JWT_SECRET not configured on admin panel server' }));
        expect(await deskFetch('/api/desk/me')).toEqual({
            ok: false, error: { code: 'internal_error', message: 'JWT_SECRET not configured on admin panel server' },
        });
    });

    it('F6 and F7 describe a body that is not JSON by its status', async () => {
        answer(504, '<html>timeout</html>');
        expect(await deskFetch('/api/desk/me')).toEqual({ ok: false, error: { code: 'internal_error', message: 'HTTP 504' } });
        answer(403, '');
        expect(await deskFetch('/api/desk/me')).toEqual({ ok: false, error: { code: 'forbidden', message: 'HTTP 403' } });
    });

    it('F8 reports a rejected fetch without throwing', async () => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockImplementation(() => Promise.reject(new TypeError('offline')));
        expect(await deskFetch('/api/desk/me')).toEqual({ ok: false, error: { code: 'internal_error', message: 'Network error' } });
    });

    it('F9 keeps the data of a 409 envelope', async () => {
        const body = {
            ok: false, error: { code: 'new_customer_message', message: 'm' },
            data: { ticket: { id: 't' }, action: null },
        };
        answer(409, JSON.stringify(body));
        expect(await deskFetch('/api/desk/tickets/x/resolve', { method: 'POST', body: '{}' })).toEqual(body);
    });
});
