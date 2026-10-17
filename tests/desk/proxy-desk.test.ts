import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { config, proxy } from '@/proxy';

const SECRET = 'unit-test-secret';
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function signed(payload: Record<string, unknown>): string {
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64(payload);
    const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${sig}`;
}

function request(path: string, token?: string, method = 'GET'): NextRequest {
    return new NextRequest(`http://localhost${path}`, {
        method,
        headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });
}

const inFuture = () => Math.floor(Date.now() / 1000) + 60;

beforeEach(() => { vi.stubEnv('JWT_SECRET', SECRET); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('proxy gate for /api/desk', () => {
    it('A1 lists the desk prefix in the matcher and keeps the others', () => {
        expect(config.matcher).toEqual(expect.arrayContaining([
            '/api/desk/:path*', '/api/whatsapp/:path*', '/api/lms/:path*', '/api/agent-tools/:path*',
        ]));
    });

    it('A2 answers 401 without a token', async () => {
        const response = await proxy(request('/api/desk/me'));
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('A3 answers 401 on a nested path without a token', async () => {
        expect((await proxy(request('/api/desk/tickets/abc/resolve', undefined, 'POST'))).status).toBe(401);
    });

    it('A4 rejects a bad signature', async () => {
        const token = `${b64({ alg: 'HS256' })}.${b64({ userId: 1 })}.AAAA`;
        const response = await proxy(request('/api/desk/me', token));
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Invalid or expired token' });
    });

    it('A5 passes a valid token through with the user id header', async () => {
        const response = await proxy(request('/api/desk/me', signed({ userId: 42, exp: inFuture() })));
        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(response.headers.get('x-middleware-request-x-user-id')).toBe('42');
    });

    it('A6 rejects a stall till token', async () => {
        const response = await proxy(request('/api/desk/me', signed({ userId: 42, stall: true, exp: inFuture() })));
        expect(response.status).toBe(401);
    });

    it('A7 does not gate a look-alike prefix', async () => {
        const response = await proxy(request('/api/deskfoo'));
        expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('A8 still gates the whatsapp surface', async () => {
        expect((await proxy(request('/api/whatsapp/conversations'))).status).toBe(401);
    });
});
