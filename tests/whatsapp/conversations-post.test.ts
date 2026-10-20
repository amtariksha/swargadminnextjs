import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/whatsapp/supabase', async () => {
    const { fakeSupabase } = await import('./fake-supabase');
    return { supabaseAdmin: fakeSupabase, supabase: fakeSupabase };
});

import { POST } from '@/app/api/whatsapp/conversations/route';
import { callsOf, fakeStore, raceInsert, resetFakeStore } from './fake-supabase';

const CONTACT = { id: 'c1', name: 'Ravi', phone: '919845012345', created_at: '2026-10-01T00:00:00.000Z' };
const conversation = (id: string) => ({
    id, contact_id: 'c1', integrated_number: 'N', status: 'open', unread_count: 0,
    last_message: '', last_message_time: '2026-10-01T00:00:00.000Z', created_at: '2026-10-01T00:00:00.000Z',
});

function post(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/whatsapp/conversations', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
}

beforeEach(() => {
    resetFakeStore({ contacts: [{ ...CONTACT }] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('POST /api/whatsapp/conversations (find-or-create)', () => {
    it('CP01 answers 400 without a contactId and touches no table', async () => {
        const response = await POST(post({}));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'contactId is required' });
        expect(fakeStore.calls).toHaveLength(0);
    });

    it('CP02 returns the existing conversation with 200 and does not insert', async () => {
        fakeStore.tables.conversations = [conversation('A')];
        const response = await POST(post({ contactId: 'c1', integratedNumber: 'N' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ id: 'A', contactId: 'c1', contact: { id: 'c1', name: 'Ravi' } });
        expect(callsOf(fakeStore, 'conversations', 'insert')).toHaveLength(0);
    });

    it('CP03 creates and maps the conversation with 201', async () => {
        const response = await POST(post({ contactId: 'c1', integratedNumber: 'N' }));
        expect(response.status).toBe(201);
        const created = fakeStore.tables.conversations[0];
        expect(await response.json()).toMatchObject({
            id: created.id, contactId: 'c1', integratedNumber: 'N', status: 'open', unreadCount: 0,
            contact: { id: 'c1', name: 'Ravi', phone: '919845012345' },
        });
    });

    it('CP04 returns the winner of an insert race with 200', async () => {
        raceInsert(fakeStore, 'conversations', conversation('X'));
        const response = await POST(post({ contactId: 'c1', integratedNumber: 'N' }));
        expect(response.status).toBe(200);
        expect((await response.json()).id).toBe('X');
        expect(fakeStore.tables.conversations).toHaveLength(1);
    });

    it('CP05 answers 500 with a fixed message when the insert fails', async () => {
        fakeStore.failNext['conversations.insert'] = { code: '23502' };
        const response = await POST(post({ contactId: 'c1', integratedNumber: 'N' }));
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to create conversation' });
    });
});
