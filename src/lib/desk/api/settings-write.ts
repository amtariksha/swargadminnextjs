// Routes 17 and 18: read and change the desk_* settings (manager). Rows are seeded by migration
// 015a, so a write only ever updates; an update that matches no row means the seed is missing.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import { DESK_SETTING_KEYS, type DeskSettingKey } from '../constants';
import type { SettingsPutBody } from '../contracts';
import { DeskApiError, dbGuard } from '../api-error';
import { createSupabaseDeskRepo } from '../repo-supabase';
import { clearDeskSettingsCache, readDeskSettings } from '../settings';
import type { DeskSettingsResponse } from '../types';
import { checkSettingsPut, settingToText } from './rules';

const TABLE = 'app_settings';

export async function readSettingsResponse(): Promise<DeskSettingsResponse> {
    const { settings, raw } = await readDeskSettings(createSupabaseDeskRepo());
    if (!settings.readable) throw new DeskApiError('internal_error', 'Desk settings could not be read.');
    const known: Partial<Record<DeskSettingKey, string>> = {};
    for (const key of DESK_SETTING_KEYS) {
        if (key in raw) known[key] = raw[key];
    }
    return { settings, raw: known };
}

async function writeSetting(key: DeskSettingKey, value: unknown): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from(TABLE)
        .update({ value: settingToText(value), updated_at: new Date().toISOString() })
        .eq('key', key)
        .is('org_id', null)
        .select('key');
    dbGuard(error, TABLE);
    if ((data ?? []).length === 0) throw new DeskApiError('not_installed', 'Desk settings are not installed.');
}

export async function writeSettings(body: SettingsPutBody): Promise<DeskSettingsResponse> {
    const { raw } = await readSettingsResponse();
    const verdict = checkSettingsPut(
        body,
        { desk_go_live_at: raw.desk_go_live_at ?? '', desk_ui_enabled: raw.desk_ui_enabled ?? '' },
        new Date(),
    );
    if (!verdict.ok) throw new DeskApiError(verdict.code, verdict.message);
    try {
        for (const key of DESK_SETTING_KEYS) {
            const value = (body as Record<string, unknown>)[key];
            if (value !== undefined) await writeSetting(key, value);
        }
    } finally {
        // Also after a partial write: this instance must not serve the old flags for 30 s.
        clearDeskSettingsCache();
    }
    return readSettingsResponse();
}
