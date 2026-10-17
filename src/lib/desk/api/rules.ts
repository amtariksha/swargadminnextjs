// Pure rule checks of the Desk API: the settings write rules (and, in a later task, the resolve
// rules). No I/O, no clock: the caller passes `now`.

import type { DeskErrorCode } from '../contracts';
import type { SettingsPutBody } from '../contracts';
import { DESK_GO_LIVE_REGEX } from '../settings';

const MS_PER_HOUR = 3_600_000;

export type RuleResult = { ok: true } | { ok: false; code: DeskErrorCode; message: string };

const OK: RuleResult = { ok: true };
const fail = (code: DeskErrorCode, message: string): RuleResult => ({ ok: false, code, message });

export interface StoredSettingsText {
    desk_go_live_at: string;
    desk_ui_enabled: string;
}

function checkGoLive(sent: string, stored: StoredSettingsText, now: Date): RuleResult {
    if (stored.desk_go_live_at.trim() !== '') {
        return fail('setting_locked', 'desk_go_live_at is already set. Changing it is an operator action.');
    }
    const sentMs = Date.parse(sent);
    if (!DESK_GO_LIVE_REGEX.test(sent) || !Number.isFinite(sentMs)) {
        return fail('validation_failed', 'desk_go_live_at: not a valid timestamp with an offset');
    }
    if (sentMs < now.getTime() - MS_PER_HOUR) {
        return fail('setting_locked', 'desk_go_live_at may be at most one hour in the past.');
    }
    return OK;
}

function checkStatsFrom(sent: string, body: SettingsPutBody, stored: StoredSettingsText): RuleResult {
    const goLive = body.desk_go_live_at ?? stored.desk_go_live_at;
    const goLiveMs = goLive.trim() === '' ? Number.NaN : Date.parse(goLive);
    if (!Number.isFinite(goLiveMs)) {
        return fail('setting_locked', 'Set desk_go_live_at before desk_stats_from.');
    }
    if (Date.parse(sent) < goLiveMs) {
        return fail('setting_locked', 'desk_stats_from cannot be earlier than desk_go_live_at.');
    }
    return OK;
}

function checkCutover(body: SettingsPutBody, stored: StoredSettingsText): RuleResult {
    const uiOn = body.desk_ui_enabled ?? stored.desk_ui_enabled === '1';
    return uiOn ? OK : fail('setting_locked', 'Turn desk_ui_enabled on before desk_cutover_redirect.');
}

export function checkSettingsPut(body: SettingsPutBody, stored: StoredSettingsText, now: Date): RuleResult {
    if (body.desk_go_live_at !== undefined) {
        const result = checkGoLive(body.desk_go_live_at, stored, now);
        if (!result.ok) return result;
    }
    if (body.desk_stats_from !== undefined) {
        const result = checkStatsFrom(body.desk_stats_from, body, stored);
        if (!result.ok) return result;
    }
    if (body.desk_cutover_redirect === true) return checkCutover(body, stored);
    return OK;
}

export function settingToText(value: unknown): string {
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}
