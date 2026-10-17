import { describe, expect, it } from 'vitest';
import { settingsPutBody } from '@/lib/desk/contracts';
import { checkSettingsPut, settingToText, type StoredSettingsText } from '@/lib/desk/api/rules';

const NOW = new Date('2026-10-20T06:00:00.000Z');
const EMPTY: StoredSettingsText = { desk_go_live_at: '', desk_ui_enabled: '0' };
const LIVE: StoredSettingsText = { desk_go_live_at: '2026-10-15T00:00:00+05:30', desk_ui_enabled: '0' };
const LIVE_UI: StoredSettingsText = { desk_go_live_at: '2026-10-15T00:00:00+05:30', desk_ui_enabled: '1' };

const run = (body: unknown, stored: StoredSettingsText) =>
    checkSettingsPut(settingsPutBody.parse(body), stored, NOW);
const codeOf = (result: ReturnType<typeof run>) => (result.ok ? 'ok' : result.code);

describe('checkSettingsPut', () => {
    it.each([
        ['S01', { desk_ui_enabled: true }, EMPTY, 'ok'],
        ['S02', { desk_go_live_at: '2026-10-20T05:30:00+00:00' }, EMPTY, 'ok'],
        ['S03', { desk_go_live_at: '2026-10-20T04:59:59+00:00' }, EMPTY, 'setting_locked'],
        ['S04', { desk_go_live_at: '2026-10-21T00:00:00+05:30' }, EMPTY, 'ok'],
        ['S05', { desk_go_live_at: '2026-10-21T00:00:00+05:30' }, LIVE, 'setting_locked'],
        ['S06', { desk_stats_from: '2026-10-14T00:00:00+05:30' }, LIVE, 'setting_locked'],
        ['S07', { desk_stats_from: '2026-10-16T00:00:00+05:30' }, LIVE, 'ok'],
        ['S08', { desk_stats_from: '2026-10-16T00:00:00+05:30' }, EMPTY, 'setting_locked'],
        ['S09', { desk_go_live_at: '2026-10-20T05:45:00+00:00', desk_stats_from: '2026-10-20T05:45:00+00:00' }, EMPTY, 'ok'],
        ['S10', { desk_cutover_redirect: true }, LIVE, 'setting_locked'],
        ['S11', { desk_cutover_redirect: true, desk_ui_enabled: true }, LIVE, 'ok'],
        ['S12', { desk_cutover_redirect: true }, LIVE_UI, 'ok'],
        ['S13', { desk_cutover_redirect: true, desk_ui_enabled: false }, LIVE_UI, 'setting_locked'],
        ['S14', { desk_cutover_redirect: false }, LIVE, 'ok'],
    ] as const)('%s', (_id, body, stored, expected) => {
        expect(codeOf(run(body, stored))).toBe(expected);
    });

    it('rejects a go-live that is not a full timestamp with an offset', () => {
        expect(settingsPutBody.safeParse({ desk_go_live_at: '2026-10-20' }).success).toBe(false);
    });
});

describe('settingsPutBody', () => {
    it.each([
        [{ desk_last_tick_at: '2026-10-20T05:45:00+00:00' }],
        [{}],
        [{ desk_ui_enabled: '1' }],
        [{ desk_go_live_at: '2026-10-20' }],
        [{ desk_reply_alert_mins: 0 }],
    ])('rejects %j', (body) => {
        expect(settingsPutBody.safeParse(body).success).toBe(false);
    });
});

describe('settingToText', () => {
    it.each([
        [true, '1'],
        [false, '0'],
        [15, '15'],
        ['shadow', 'shadow'],
        ['2026-10-20T05:45:00+00:00', '2026-10-20T05:45:00+00:00'],
        [{ '917090166111': 'sales' }, '{"917090166111":"sales"}'],
    ])('%j', (value, text) => {
        expect(settingToText(value)).toBe(text);
    });
});
