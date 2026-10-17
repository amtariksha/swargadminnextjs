// One builder for both health routes (this unit's service-token route; the panel's strip in a later
// unit). It writes nothing: the canWrite probe is an update that matches no row. It reports problems
// as fields inside a normal answer and never returns a secret, only whether the service key exists.

import { PROBE_TARGETS, type DeskDb, type DeskRepo } from './repo';
import { allOffDeskSettings, parseDeskSettings } from './settings';
import type { DeskHealth, DeskTickStats } from './types';

type Failure = 'timeout' | 'error' | null;

function failureOf(results: ReadonlyArray<DeskDb<unknown>>): Failure {
    if (results.some((result) => result.outcome === 'timeout')) return 'timeout';
    if (results.some((result) => result.outcome === 'error' || result.outcome === 'conflict')) return 'error';
    return null;
}

function parseStats(raw: string | undefined): DeskTickStats | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        const looksRight = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            && typeof (parsed as Record<string, unknown>).at === 'string';
        return looksRight ? (parsed as DeskTickStats) : null;
    } catch {
        // A stats row that is not JSON is reported as "no stats", never as an error of the health route.
        return null;
    }
}

function emptyHealth(serviceKeyPresent: boolean, error: string): DeskHealth {
    return {
        installed: false, missing: [...PROBE_TARGETS], canWrite: false, serviceKeyPresent,
        flags: {
            desk_engine_enabled: false, desk_inline_hooks: false, desk_ui_enabled: false,
            desk_cutover_redirect: false, desk_ack_suppress: 'off', desk_go_live_at: null, go_live_valid: false,
        },
        lastTickAt: null, lastTickAgeSeconds: null, lastTickStats: null, error,
    };
}

export async function buildDeskHealth(deps: { repo: DeskRepo; now: Date }): Promise<DeskHealth> {
    const serviceKeyPresent = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    try {
        const [probes, writeProbe, rows] = await Promise.all([
            Promise.all(PROBE_TARGETS.map((target) => deps.repo.probe(target))),
            deps.repo.probeWrite(),
            deps.repo.readSettingRows(),
        ]);
        const missing = PROBE_TARGETS.filter((_target, index) => probes[index].outcome !== 'ok');
        const settings = rows.outcome === 'ok' ? parseDeskSettings(rows.data) : allOffDeskSettings();
        const raw = new Map(rows.outcome === 'ok' ? rows.data.map((row) => [row.key, row.value ?? ''] as const) : []);
        const goLive = (raw.get('desk_go_live_at') ?? '').trim();
        const lastTickAt = settings.last_tick_at;
        return {
            installed: missing.length === 0,
            missing,
            canWrite: serviceKeyPresent && writeProbe.outcome === 'ok',
            serviceKeyPresent,
            flags: {
                desk_engine_enabled: settings.engine_enabled,
                desk_inline_hooks: settings.inline_hooks,
                desk_ui_enabled: settings.ui_enabled,
                desk_cutover_redirect: settings.cutover_redirect,
                desk_ack_suppress: settings.ack_suppress,
                desk_go_live_at: goLive === '' ? null : goLive,
                go_live_valid: settings.go_live_at !== null,
            },
            lastTickAt,
            lastTickAgeSeconds: lastTickAt === null
                ? null
                : Math.max(0, Math.round((deps.now.getTime() - Date.parse(lastTickAt)) / 1000)),
            lastTickStats: parseStats(raw.get('desk_last_tick_stats')),
            error: failureOf([...probes, writeProbe, rows]),
        };
    } catch (error) {
        return emptyHealth(serviceKeyPresent, error instanceof Error ? error.name : 'Error');
    }
}
