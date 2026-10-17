// Desk settings: parsing of the global desk_* rows of public.app_settings and one cached reader.
// Fail-closed by construction: any read problem, a duplicate key, or a value that is not exactly
// what the parse table accepts means "off" or "the default". Only org_id IS NULL rows are read:
// the org-merging settings helper would let a legacy token override a Desk flag.

import {
    ACK_SUPPRESS_MODES, DESK_SETTING_KEYS, SETTING_DEFAULTS, SETTINGS_CACHE_MS,
    type AckSuppressMode, type DeskSettingKey, type Queue,
} from './constants';
import { parseHHMM } from './business-hours';
import type { DeskRepo, SettingRow } from './repo';
import type { BusinessHours, DeskSettings } from './types';

export const DESK_GO_LIVE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
    start: SETTING_DEFAULTS.desk_business_hours.start,
    end: SETTING_DEFAULTS.desk_business_hours.end,
    days: [...SETTING_DEFAULTS.desk_business_hours.days],
};

export function allOffDeskSettings(): DeskSettings {
    return {
        engine_enabled: false,
        inline_hooks: false,
        ui_enabled: false,
        cutover_redirect: false,
        ack_suppress: 'off',
        go_live_at: null,
        stats_from: null,
        reopen_window_hours: SETTING_DEFAULTS.desk_reopen_window_hours,
        idle_close_hours: SETTING_DEFAULTS.desk_idle_close_hours,
        ack_autoclose_hours: SETTING_DEFAULTS.desk_ack_autoclose_hours,
        reply_alert_mins: SETTING_DEFAULTS.desk_reply_alert_mins,
        number_queues: {},
        business_hours: { ...DEFAULT_BUSINESS_HOURS, days: [...DEFAULT_BUSINESS_HOURS.days] },
        credit_max_agent: SETTING_DEFAULTS.desk_credit_max_agent,
        last_tick_at: null,
        readable: false,
    };
}

// ── Field parsers ──────────────────────────────────────────────────────────

const isOn = (value: string | undefined): boolean => value === '1';

function parseTimestamp(value: string | undefined): string | null {
    if (typeof value !== 'string' || !DESK_GO_LIVE_REGEX.test(value)) return null;
    return Number.isFinite(Date.parse(value)) ? value : null;
}

function parseAckMode(value: string | undefined): AckSuppressMode {
    return (ACK_SUPPRESS_MODES as readonly string[]).includes(value ?? '')
        ? (value as AckSuppressMode)
        : SETTING_DEFAULTS.desk_ack_suppress;
}

interface Bounds { min: number; max: number; minExclusive?: boolean }

function parseBounded(value: string | undefined, bounds: Bounds, fallback: number): number {
    if (typeof value !== 'string' || value.trim() === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const aboveMin = bounds.minExclusive ? parsed > bounds.min : parsed >= bounds.min;
    return aboveMin && parsed <= bounds.max ? parsed : fallback;
}

function parseJson(value: string | undefined): unknown {
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        // Not JSON: the caller falls back to the default for that setting.
        return null;
    }
}

function parseNumberQueues(value: string | undefined): Record<string, Queue> {
    const parsed = parseJson(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const queues: Record<string, Queue> = {};
    for (const [number, queue] of Object.entries(parsed)) {
        if (queue === 'care' || queue === 'sales') queues[number] = queue;
    }
    return queues;
}

function parseBusinessHours(value: string | undefined): BusinessHours {
    const parsed = parseJson(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...DEFAULT_BUSINESS_HOURS };
    const { start, end, days } = parsed as Record<string, unknown>;
    const validDays = Array.isArray(days) && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (parseHHMM(start) === null || parseHHMM(end) === null || !validDays) return { ...DEFAULT_BUSINESS_HOURS };
    return { start: start as string, end: end as string, days: [...(days as number[])] };
}

// ── Parse and read ─────────────────────────────────────────────────────────

function valuesByKey(rows: ReadonlyArray<SettingRow>): Map<string, string> | null {
    const known: readonly string[] = DESK_SETTING_KEYS;
    const values = new Map<string, string>();
    for (const row of rows) {
        if (!known.includes(row.key)) continue;
        if (values.has(row.key)) return null;
        values.set(row.key, row.value ?? '');
    }
    return values;
}

export function parseDeskSettings(rows: ReadonlyArray<SettingRow>): DeskSettings {
    const values = valuesByKey(rows);
    if (values === null) return allOffDeskSettings();
    const get = (key: DeskSettingKey): string | undefined => values.get(key);
    return {
        engine_enabled: isOn(get('desk_engine_enabled')),
        inline_hooks: isOn(get('desk_inline_hooks')),
        ui_enabled: isOn(get('desk_ui_enabled')),
        cutover_redirect: isOn(get('desk_cutover_redirect')),
        ack_suppress: parseAckMode(get('desk_ack_suppress')),
        go_live_at: parseTimestamp(get('desk_go_live_at')),
        stats_from: parseTimestamp(get('desk_stats_from')),
        reopen_window_hours: parseBounded(get('desk_reopen_window_hours'), { min: 0, max: 72, minExclusive: true }, SETTING_DEFAULTS.desk_reopen_window_hours),
        idle_close_hours: parseBounded(get('desk_idle_close_hours'), { min: 0, max: 720, minExclusive: true }, SETTING_DEFAULTS.desk_idle_close_hours),
        ack_autoclose_hours: parseBounded(get('desk_ack_autoclose_hours'), { min: 0, max: 72, minExclusive: true }, SETTING_DEFAULTS.desk_ack_autoclose_hours),
        reply_alert_mins: parseBounded(get('desk_reply_alert_mins'), { min: 1, max: 240 }, SETTING_DEFAULTS.desk_reply_alert_mins),
        number_queues: parseNumberQueues(get('desk_number_queues')),
        business_hours: parseBusinessHours(get('desk_business_hours')),
        credit_max_agent: parseBounded(get('desk_credit_max_agent'), { min: 0, max: 5000 }, SETTING_DEFAULTS.desk_credit_max_agent),
        last_tick_at: Number.isFinite(Date.parse(get('desk_last_tick_at') ?? '')) ? (get('desk_last_tick_at') as string) : null,
        readable: true,
    };
}

/** One uncached read. `raw` is the stored text of every desk_* row, for callers that report it as written. */
export async function readDeskSettings(
    repo: DeskRepo,
): Promise<{ settings: DeskSettings; raw: Record<string, string> }> {
    const result = await repo.readSettingRows();
    if (result.outcome !== 'ok') return { settings: allOffDeskSettings(), raw: {} };
    const raw: Record<string, string> = {};
    for (const row of result.data) raw[row.key] = row.value ?? '';
    return { settings: parseDeskSettings(result.data), raw };
}

// ── Cached reader ──────────────────────────────────────────────────────────

let cached: { settings: DeskSettings; readAtMs: number } | null = null;

export function clearDeskSettingsCache(): void {
    cached = null;
}

async function defaultRepo(): Promise<DeskRepo> {
    // Imported on demand so that this module (and its tests) never load the Supabase client.
    const { createSupabaseDeskRepo } = await import('./repo-supabase');
    return createSupabaseDeskRepo();
}

/** Cached for SETTINGS_CACHE_MS per server instance. A failed read is not cached and returns the all-off object. */
export async function getDeskSettings(
    deps: { repo?: DeskRepo; clock?: () => number } = {},
): Promise<DeskSettings> {
    const nowMs = (deps.clock ?? Date.now)();
    if (cached && nowMs - cached.readAtMs < SETTINGS_CACHE_MS) return cached.settings;
    const { settings } = await readDeskSettings(deps.repo ?? await defaultRepo());
    cached = settings.readable ? { settings, readAtMs: nowMs } : null;
    return settings;
}
