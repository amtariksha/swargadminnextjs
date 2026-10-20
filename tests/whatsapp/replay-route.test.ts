import { beforeEach, describe, expect, it, vi } from 'vitest';

const journal = vi.hoisted(() => {
    class JournalNotInstalledError extends Error {}
    return { replayJournal: vi.fn(), clearWebhookJournalState: vi.fn(), JournalNotInstalledError };
});
vi.mock('@/lib/whatsapp/webhook-journal', () => journal);
vi.mock('@/lib/whatsapp/supabase', () => ({ supabaseAdmin: { from: vi.fn() }, supabase: { from: vi.fn() } }));
vi.mock('@/app/api/whatsapp/webhooks/msg91/route', () => ({ POST: vi.fn() }));
vi.mock('@/app/api/whatsapp/webhooks/meta/route', () => ({ POST: vi.fn() }));

import { maxDuration, POST } from '@/app/api/agent-tools/whatsapp/replay/route';
import { POST as metaWebhook } from '@/app/api/whatsapp/webhooks/meta/route';
import { POST as msg91Webhook } from '@/app/api/whatsapp/webhooks/msg91/route';
import { clearWebhookAuthCache } from '@/lib/whatsapp/webhook-auth';

beforeEach(() => {
    clearWebhookAuthCache();
    journal.clearWebhookJournalState();
    journal.replayJournal.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/agent-tools/whatsapp/replay', () => {
    it('RR01 answers the replay counts', async () => {
        journal.replayJournal.mockResolvedValue({ scanned: 2, replayed: 1, failed: 1 });
        const response = await POST();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true, data: { scanned: 2, replayed: 1, failed: 1 } });
        expect(journal.replayJournal).toHaveBeenCalledWith({ handlers: { msg91: msg91Webhook, meta: metaWebhook } });
    });

    it('RR02 answers 503 not_installed before migration 017c', async () => {
        journal.replayJournal.mockRejectedValue(new journal.JournalNotInstalledError('missing'));
        const response = await POST();
        expect(response.status).toBe(503);
        expect((await response.json()).error.code).toBe('not_installed');
    });

    it('RR03 answers 500 without the error text', async () => {
        journal.replayJournal.mockRejectedValue(new Error('secret detail from the database'));
        const response = await POST();
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error.code).toBe('internal_error');
        expect(JSON.stringify(body)).not.toContain('secret detail');
    });

    it('declares a 60 s budget', () => {
        expect(maxDuration).toBe(60);
    });
});
