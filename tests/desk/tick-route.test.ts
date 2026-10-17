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

beforeEach(() => { vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key'); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('POST /api/agent-tools/desk/tick', () => {
    it('R01 answers 200 with a skipped run when the engine is off', async () => {
        use(createFakeDeskRepo({ settings: defaultSettings({ desk_engine_enabled: '0' }) }));
        const response = await POST();
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({ ok: true, data: { ran: false, skipped: 'engine_off', heartbeat_written: true, steps: {} } });
    });

    it('R02 answers 200 with not_installed before the migration', async () => {
        const fake = createFakeDeskRepo();
        fake.setInstall('no_015a');
        use(fake);
        const response = await POST();
        expect(response.status).toBe(200);
        expect((await response.json()).data.skipped).toBe('not_installed');
    });

    it('R03 answers 500 with the fixed envelope when the repository cannot be built', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        state.fail = true;
        const response = await POST();
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ ok: false, error: { code: 'internal_error', message: 'The Desk tick failed.' } });
    });

    it('runs the engine when it is on', async () => {
        use(createFakeDeskRepo({ settings: defaultSettings() }));
        const body = await (await POST()).json();
        expect(body.data).toMatchObject({ ran: true, skipped: null });
        expect(Object.keys(body.data.steps)).toHaveLength(6);
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
