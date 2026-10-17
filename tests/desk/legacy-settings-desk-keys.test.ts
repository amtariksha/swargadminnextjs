import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const from = vi.hoisted(() => vi.fn());
vi.mock('@/lib/whatsapp/supabase', () => ({ supabaseAdmin: { from } }));

import { GET, PUT } from '@/app/api/whatsapp/settings/route';

const headers = { 'x-user-id': '1', 'x-user-role': 'super_admin', 'x-user-org-id': '' };

function put(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/whatsapp/settings', {
        method: 'PUT', headers, body: JSON.stringify(body),
    });
}

beforeEach(() => { from.mockReset(); });

describe('legacy settings route and desk_* keys', () => {
    it('L1 rejects a desk key without touching the database', async () => {
        from.mockImplementation(() => { throw new Error('must not be called'); });
        const response = await PUT(put({ desk_ui_enabled: '1' }));
        expect(response.status).toBe(400);
        expect(await response.json()).toHaveProperty('error');
        expect(from).not.toHaveBeenCalled();
    });

    it('L2 rejects the whole request when one key is a desk key', async () => {
        from.mockImplementation(() => { throw new Error('must not be called'); });
        const response = await PUT(put({ msg91_auth_key: 'x', desk_cutover_redirect: '1' }));
        expect(response.status).toBe(400);
        expect(from).not.toHaveBeenCalled();
    });

    it('L3 omits desk keys from the GET response', async () => {
        from.mockImplementation(() => ({
            select: () => ({
                is: () => Promise.resolve({
                    data: [
                        { key: 'desk_ui_enabled', value: '1' },
                        { key: 'desk_last_tick_at', value: 'x' },
                        { key: 'meta_api_version', value: 'v21.0' },
                    ],
                    error: null,
                }),
            }),
        }));
        const response = await GET(new NextRequest('http://localhost/api/whatsapp/settings', { headers }));
        const body = await response.json();
        expect(body.meta_api_version).toBe('v21.0');
        expect(Object.keys(body).filter((key) => key.startsWith('desk_'))).toEqual([]);
    });
});
