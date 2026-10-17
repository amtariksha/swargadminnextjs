import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { buildDeskHealth } from '@/lib/desk/health';
import { PROBE_TARGETS } from '@/lib/desk/repo';
import type { DeskHealth } from '@/lib/desk/types';
import { NOW, createFakeDeskRepo, defaultSettings, ts } from './fake-repo';

const statsRow = JSON.stringify({ at: ts(30), duration_ms: 120, orphans: 0, orphans_capped: false, oldest_orphan_age_s: null, failed_replies_24h: 0, steps: {} });
const healthyFake = (overrides: Record<string, string> = {}) => createFakeDeskRepo({
    settings: defaultSettings({ desk_last_tick_at: ts(30), desk_last_tick_stats: statsRow, ...overrides }),
});

beforeEach(() => { vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key-for-tests'); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('buildDeskHealth', () => {
    it('H01 a healthy system', async () => {
        const health = await buildDeskHealth({ repo: healthyFake(), now: NOW });
        expect(health).toMatchObject({
            installed: true, missing: [], canWrite: true, serviceKeyPresent: true, lastTickAgeSeconds: 30, error: null,
            flags: { desk_engine_enabled: true, desk_ack_suppress: 'shadow', go_live_valid: true },
        });
        expect(health.lastTickStats).toMatchObject({ duration_ms: 120 });
    });

    it('H02 migration 015a missing lists every target', async () => {
        const fake = healthyFake();
        fake.setInstall('no_015a');
        const health = await buildDeskHealth({ repo: fake, now: NOW });
        expect(health).toMatchObject({
            installed: false, missing: [...PROBE_TARGETS], canWrite: false, lastTickAt: null, lastTickAgeSeconds: null,
            lastTickStats: null, error: null,
        });
    });

    it('H03 migration 015b missing lists the three messages columns', async () => {
        const fake = healthyFake();
        fake.setInstall('no_015b');
        const health = await buildDeskHealth({ repo: fake, now: NOW });
        expect(health).toMatchObject({
            installed: false, missing: ['messages.ticket_id', 'messages.sent_by_user_id', 'messages.sent_by_name'], canWrite: true,
        });
    });

    it('H04 without the service key nothing can be written', async () => {
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
        const fake = healthyFake();
        fake.setInstall('no_service_key');
        expect(await buildDeskHealth({ repo: fake, now: NOW })).toMatchObject({ serviceKeyPresent: false, canWrite: false, installed: false });
    });

    it('does not claim canWrite when the key is missing even if the probe succeeds', async () => {
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
        expect((await buildDeskHealth({ repo: healthyFake(), now: NOW })).canWrite).toBe(false);
    });

    it('H05 timeouts mark everything missing and report the error class', async () => {
        const fake = healthyFake();
        fake.failNext('probe', 'TIMEOUT', 8);
        const health = await buildDeskHealth({ repo: fake, now: NOW });
        expect(health).toMatchObject({ installed: false, missing: [...PROBE_TARGETS], error: 'timeout' });
    });

    it('reports an unreadable settings table as flags off and an error', async () => {
        const fake = healthyFake();
        fake.failNext('readSettingRows', 'XX000');
        const health = await buildDeskHealth({ repo: fake, now: NOW });
        expect(health).toMatchObject({ error: 'error', lastTickAt: null });
        expect(health.flags).toMatchObject({ desk_engine_enabled: false, desk_ack_suppress: 'off', go_live_valid: false });
    });

    it('H06 shows the stored go-live text and whether it is valid', async () => {
        const health = await buildDeskHealth({ repo: healthyFake({ desk_go_live_at: ' garbage ' }), now: NOW });
        expect(health.flags).toMatchObject({ desk_go_live_at: 'garbage', go_live_valid: false });
        const empty = await buildDeskHealth({ repo: healthyFake({ desk_go_live_at: '' }), now: NOW });
        expect(empty.flags.desk_go_live_at).toBeNull();
    });

    it('H07 has exactly the keys of DeskHealth, writes nothing and carries no secret', async () => {
        const fake = healthyFake();
        const health = await buildDeskHealth({ repo: fake, now: NOW });
        const keys: Array<keyof DeskHealth> = ['installed', 'missing', 'canWrite', 'serviceKeyPresent', 'flags', 'lastTickAt', 'lastTickAgeSeconds', 'lastTickStats', 'error'];
        expect(Object.keys(health).sort()).toEqual([...keys].sort());
        expect(fake.writes).toEqual([]);
        expect(JSON.stringify(health)).not.toContain('service-key-for-tests');
    });

    it('treats an unparseable stats row as no stats', async () => {
        expect((await buildDeskHealth({ repo: healthyFake({ desk_last_tick_stats: 'not json' }), now: NOW })).lastTickStats).toBeNull();
        expect((await buildDeskHealth({ repo: healthyFake({ desk_last_tick_stats: '[1]' }), now: NOW })).lastTickStats).toBeNull();
    });

    it('answers with the class name when the builder itself throws', async () => {
        const fake = healthyFake();
        fake.before('probeWrite', () => { throw new RangeError('x'); });
        expect(await buildDeskHealth({ repo: fake, now: NOW })).toMatchObject({ installed: false, error: 'RangeError', canWrite: false });
    });
});
