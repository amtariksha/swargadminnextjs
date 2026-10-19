import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createFakeDeskRepo, defaultSettings, type FakeDeskRepo } from './fake-repo';

const state = vi.hoisted(() => ({ repo: null as unknown, fail: false }));

vi.mock('@/lib/desk/repo-supabase', () => ({
    createSupabaseDeskRepo: () => {
        if (state.fail) throw new TypeError('no client');
        return state.repo;
    },
}));

import { POST, maxDuration } from '@/app/api/agent-tools/desk/tick/route';
import { GET } from '@/app/api/agent-tools/desk/health/route';

const use = (fake: FakeDeskRepo) => { state.repo = fake; state.fail = false; };
const URL_TICK = 'http://localhost/api/agent-tools/desk/tick';
const tickRequest = (body?: string): Request => new Request(URL_TICK, { method: 'POST', body, headers: { 'content-type': 'application/json' } });

beforeEach(() => { vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key'); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('POST /api/agent-tools/desk/tick', () => {
    it('R01 answers 200 with a skipped run when the engine is off', async () => {
        use(createFakeDeskRepo({ settings: defaultSettings({ desk_engine_enabled: '0' }) }));
        const response = await POST(tickRequest());
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({ ok: true, data: { ran: false, skipped: 'engine_off', heartbeat_written: true, steps: {} } });
    });

    it('R02 answers 200 with not_installed before the migration', async () => {
        const fake = createFakeDeskRepo();
        fake.setInstall('no_015a');
        use(fake);
        const response = await POST(tickRequest());
        expect(response.status).toBe(200);
        expect((await response.json()).data.skipped).toBe('not_installed');
    });

    it('R03 answers 500 with the fixed envelope when the repository cannot be built', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        state.fail = true;
        const response = await POST(tickRequest());
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ ok: false, error: { code: 'internal_error', message: 'The Desk tick failed.' } });
    });

    it('runs the engine when it is on', async () => {
        use(createFakeDeskRepo({ settings: defaultSettings() }));
        const body = await (await POST(tickRequest())).json();
        expect(body.data).toMatchObject({ ran: true, skipped: null });
        expect(Object.keys(body.data.steps)).toHaveLength(7);
    });

    it('R05 passes the staff list of the body to the engine', async () => {
        use(createFakeDeskRepo({ settings: defaultSettings() }));
        const body = await (await POST(tickRequest(JSON.stringify({ staff_phones: ['9900000011', '9900000012'] })))).json();
        expect(body.data.steps.internal).toMatchObject({ staff_list: 2, flags: 0, resolved: 0 });
    });

    it.each([
        ['no body', undefined],
        ['not JSON', 'staff_phones=1'],
        ['a phone that is not 10 digits', JSON.stringify({ staff_phones: ['12345'] })],
        ['a list that is not an array', JSON.stringify({ staff_phones: '9900000011' })],
    ])('R06 %s is "no list", never an error', async (_label, raw) => {
        use(createFakeDeskRepo({ settings: defaultSettings() }));
        const response = await POST(tickRequest(raw));
        expect(response.status).toBe(200);
        expect((await response.json()).data.steps.internal.staff_list).toBeNull();
    });

    it('R07 unknown keys in the body are ignored', async () => {
        use(createFakeDeskRepo({ settings: defaultSettings() }));
        const body = await (await POST(tickRequest(JSON.stringify({ staff_phones: [], extra: 1 })))).json();
        expect(body.data.steps.internal.staff_list).toBe(0);
    });

    it('allows 30 seconds', () => {
        expect(maxDuration).toBe(30);
    });
});

describe('GET /api/agent-tools/desk/health', () => {
    it('R04 answers 200 with installed true', async () => {
        use(createFakeDeskRepo({ settings: defaultSettings() }));
        const response = await GET();
        expect(response.status).toBe(200);
        expect((await response.json()).data).toMatchObject({ installed: true, canWrite: true });
    });

    it('answers 200 even when Desk is not installed', async () => {
        const fake = createFakeDeskRepo();
        fake.setInstall('no_015a');
        use(fake);
        const response = await GET();
        expect(response.status).toBe(200);
        expect((await response.json()).data.installed).toBe(false);
    });
});
