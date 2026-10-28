import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { resetWhoamiCacheForTests } from '@/lib/desk/whoami';

// The proxy's server-side role gate for /api/whatsapp and /api/lms: a valid
// backend JWT is not enough (every customer-app login gets one); the backend's
// whoami must say back-office staff, or whatsapp-inbox for WhatsApp.

const SECRET = 'unit-test-secret';
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function signed(payload: Record<string, unknown>): string {
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64({ exp: Math.floor(Date.now() / 1000) + 600, ...payload });
    const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${sig}`;
}

const request = (path: string, token: string) =>
    new NextRequest(`http://localhost${path}`, { headers: { authorization: `Bearer ${token}` } });

const whoami = (over: Record<string, unknown>): Response =>
    new Response(JSON.stringify({
        response: 200, status: true, message: 'successfully',
        data: {
            user: { id: '42', name: 'Test' },
            agent: false, manager: false, money: false, inbox: false, via: 'none',
            ...over,
        },
    }), { status: 200 });

const CUSTOMER = { staff: false };
const STAFF = { staff: true };
const INBOX_DRIVER = { agent: true, inbox: true, via: 'delivery_capability', staff: false };

const fetchMock = vi.fn();
const passedThrough = (response: Response) => response.headers.get('x-middleware-next') === '1';

beforeEach(() => {
    vi.stubEnv('JWT_SECRET', SECRET);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    resetWhoamiCacheForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('proxy role gate: /api/whatsapp and /api/lms', () => {
    it('G1 refuses a customer token with 403 after asking whoami', async () => {
        fetchMock.mockResolvedValue(whoami(CUSTOMER));
        const response = await proxy(request('/api/whatsapp/conversations', signed({ userId: 4021 })));
        expect(response.status).toBe(403);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/swarg\/support\/whoami$/);
    });

    it('G2 lets back-office staff through as super_admin', async () => {
        fetchMock.mockResolvedValue(whoami(STAFF));
        const response = await proxy(request('/api/whatsapp/conversations', signed({ userId: 42 })));
        expect(passedThrough(response)).toBe(true);
        expect(response.headers.get('x-middleware-request-x-user-role')).toBe('super_admin');
        expect(response.headers.get('x-middleware-request-x-user-id')).toBe('42');
    });

    it('G3 lets a whatsapp-inbox driver into WhatsApp but not LMS', async () => {
        fetchMock.mockResolvedValue(whoami(INBOX_DRIVER));
        const token = signed({ userId: 605 });
        expect(passedThrough(await proxy(request('/api/whatsapp/conversations', token)))).toBe(true);
        expect((await proxy(request('/api/lms/leads', token))).status).toBe(403);
    });

    it('G4 lets staff into LMS and refuses a customer', async () => {
        fetchMock.mockResolvedValueOnce(whoami(STAFF));
        expect(passedThrough(await proxy(request('/api/lms/leads', signed({ userId: 42 }))))).toBe(true);
        fetchMock.mockResolvedValueOnce(whoami(CUSTOMER));
        expect((await proxy(request('/api/lms/leads', signed({ userId: 4021 })))).status).toBe(403);
    });

    it('G5 a token the backend refuses is a 401', async () => {
        fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
        expect((await proxy(request('/api/whatsapp/templates', signed({ userId: 42 })))).status).toBe(401);
    });

    it('G6 a backend outage is a 503, never an allow', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
        expect((await proxy(request('/api/whatsapp/templates', signed({ userId: 42 })))).status).toBe(503);
    });

    it('G7 caches the answer per token', async () => {
        fetchMock.mockResolvedValue(whoami(STAFF));
        const token = signed({ userId: 42 });
        await proxy(request('/api/whatsapp/conversations', token));
        await proxy(request('/api/whatsapp/messages', token));
        await proxy(request('/api/lms/leads', token));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('G8 a backend without the staff flag keeps LMS closed and WhatsApp to inbox holders', async () => {
        fetchMock.mockResolvedValue(whoami({ agent: true, manager: true, money: true, inbox: true, via: 'full_access' }));
        const token = signed({ userId: 42 });
        expect(passedThrough(await proxy(request('/api/whatsapp/conversations', token)))).toBe(true);
        expect((await proxy(request('/api/lms/leads', token))).status).toBe(403);
    });

    it('G9 refuses another tenant\'s token locally, without asking the backend', async () => {
        const response = await proxy(request('/api/whatsapp/conversations', signed({ userId: 42, tenant: 'acme' })));
        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('G10 accepts its own tenant\'s token', async () => {
        fetchMock.mockResolvedValue(whoami(STAFF));
        const response = await proxy(request('/api/whatsapp/conversations', signed({ userId: 42, tenant: 'swarg' })));
        expect(passedThrough(response)).toBe(true);
    });

    it('G11 leaves /api/desk to withDesk: no whoami call in the proxy', async () => {
        const response = await proxy(request('/api/desk/me', signed({ userId: 42 })));
        expect(passedThrough(response)).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('G12 leaves the provider webhooks ungated', async () => {
        const response = await proxy(new NextRequest('http://localhost/api/whatsapp/webhooks/meta', { method: 'POST' }));
        expect(passedThrough(response)).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
