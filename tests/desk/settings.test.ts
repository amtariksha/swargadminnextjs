import { beforeEach, describe, it, expect } from 'vitest';
import {
    allOffDeskSettings, clearDeskSettingsCache, getDeskSettings, parseDeskSettings, readDeskSettings,
} from '@/lib/desk/settings';
import { DESK_SETTING_KEYS } from '@/lib/desk/constants';
import { createFakeDeskRepo, defaultSettings } from './fake-repo';

/** The 16 rows exactly as migration 015a seeds them, then overridden per vector. */
function rows(overrides: Record<string, string | null> = {}, omit: string[] = []): Array<{ key: string; value: string | null }> {
    const seeded: Record<string, string> = {
        ...defaultSettings(), desk_business_hours: '{"start":"05:30","end":"22:45","days":[0,1,2,3,4,5,6]}',
        desk_go_live_at: '2026-10-15T05:00:00+05:30', desk_engine_enabled: '1',
    };
    return DESK_SETTING_KEYS.filter((key) => !omit.includes(key))
        .map((key) => ({ key, value: key in overrides ? overrides[key] : seeded[key] }));
}
const parse = (key: string, value: string | null) => parseDeskSettings(rows({ [key]: value }));

describe('parseDeskSettings', () => {
    it('S01 reads the seeded rows', () => {
        const settings = parseDeskSettings(rows());
        expect(settings).toMatchObject({
            readable: true, engine_enabled: true, go_live_at: '2026-10-15T05:00:00+05:30', ack_suppress: 'shadow',
            reopen_window_hours: 2, idle_close_hours: 24, ack_autoclose_hours: 2, reply_alert_mins: 15,
            credit_max_agent: 200, last_tick_at: null,
            number_queues: { '917090166111': 'sales', '917996196111': 'care' },
            // The vector says 22:00; migration 015a seeds 22:45 (live-schema fact B5), which is what is read.
            business_hours: { start: '05:30', end: '22:45', days: [0, 1, 2, 3, 4, 5, 6] },
        });
    });

    it.each(['true', 'yes', ' 1', '01', '', null])('S02 engine flag %j is off', (value) => {
        expect(parse('desk_engine_enabled', value).engine_enabled).toBe(false);
    });
    it('S02 a missing engine row is off', () => {
        expect(parseDeskSettings(rows({}, ['desk_engine_enabled'])).engine_enabled).toBe(false);
    });
    it('treats the other three flags the same way', () => {
        const settings = parseDeskSettings(rows({ desk_inline_hooks: '1', desk_ui_enabled: 'true', desk_cutover_redirect: '1' }));
        expect([settings.inline_hooks, settings.ui_enabled, settings.cutover_redirect]).toEqual([true, false, true]);
    });

    it.each(['2026-10-14T23:30:00Z', '2026-10-15T05:00:00.123456+00:00', '2026-10-15T05:00+05:30', '2026-10-15T05:00:00+05:30'])(
        'S03 go-live %s is valid and unchanged', (value) => {
            expect(parse('desk_go_live_at', value).go_live_at).toBe(value);
            expect(parse('desk_stats_from', value).stats_from).toBe(value);
        });
    it.each(['2026-10-15', '2026-10-15 05:00:00+05:30', '2026-10-15T05:00', 'garbage', '', null])('S04 go-live %j is invalid', (value) => {
        expect(parse('desk_go_live_at', value).go_live_at).toBeNull();
    });

    it.each([['on', 'on'], ['off', 'off'], ['shadow', 'shadow'], ['yes', 'shadow'], [null, 'shadow']] as const)(
        'S05 ack mode %j -> %s', (value, expected) => {
            expect(parse('desk_ack_suppress', value).ack_suppress).toBe(expected);
        });
    it('S05 a missing ack row is shadow', () => {
        expect(parseDeskSettings(rows({}, ['desk_ack_suppress'])).ack_suppress).toBe('shadow');
    });

    it.each([['2', 2], ['0.5', 0.5], ['72', 72], ['0', 2], ['-1', 2], ['73', 2], ['abc', 2], ['', 2]] as const)(
        'S06 reopen window %j -> %d', (value, expected) => {
            expect(parse('desk_reopen_window_hours', value).reopen_window_hours).toBe(expected);
        });
    it.each([['24', 24], ['720', 720], ['721', 24], ['0', 24]] as const)('S07 idle close %j -> %d', (value, expected) => {
        expect(parse('desk_idle_close_hours', value).idle_close_hours).toBe(expected);
    });
    it.each([['2', 2], ['72', 72], ['73', 2], ['x', 2]] as const)('S08 ack autoclose %j -> %d', (value, expected) => {
        expect(parse('desk_ack_autoclose_hours', value).ack_autoclose_hours).toBe(expected);
    });
    it.each([['1', 1], ['240', 240], ['0', 15], ['241', 15]] as const)('reply alert %j -> %d', (value, expected) => {
        expect(parse('desk_reply_alert_mins', value).reply_alert_mins).toBe(expected);
    });
    it.each([['0', 0], ['5000', 5000], ['5001', 200], ['-1', 200]] as const)('credit max %j -> %d', (value, expected) => {
        expect(parse('desk_credit_max_agent', value).credit_max_agent).toBe(expected);
    });

    it.each([
        ['{"917090166111":"sales","x":"vip"}', { '917090166111': 'sales' }],
        ['[1,2]', {}], ['not json', {}], ['', {}], ['null', {}],
    ] as const)('S09 number queues %j', (value, expected) => {
        expect(parse('desk_number_queues', value).number_queues).toEqual(expected);
    });

    it('S10 business hours', () => {
        expect(parse('desk_business_hours', '{"start":"06:00","end":"21:30","days":[1,2,3]}').business_hours)
            .toEqual({ start: '06:00', end: '21:30', days: [1, 2, 3] });
        const fallback = { start: '05:30', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] };
        expect(parse('desk_business_hours', '{"start":"6","end":"22:00","days":[0]}').business_hours).toEqual(fallback);
        expect(parse('desk_business_hours', '{}').business_hours).toEqual(fallback);
        expect(parse('desk_business_hours', '{"start":"06:00","end":"21:30","days":[7]}').business_hours).toEqual(fallback);
    });

    it.each([['2026-10-12T06:29:00.000Z', '2026-10-12T06:29:00.000Z'], ['never', null], ['', null]] as const)(
        'S11 last tick %j', (value, expected) => {
            expect(parse('desk_last_tick_at', value).last_tick_at).toBe(expected);
        });

    it('S12 a duplicate key gives the all-off object', () => {
        const duplicated = [...rows(), { key: 'desk_ui_enabled', value: '1' }];
        expect(parseDeskSettings(duplicated)).toEqual(allOffDeskSettings());
        expect(parseDeskSettings(duplicated).readable).toBe(false);
    });

    it('ignores keys that are not desk settings', () => {
        expect(parseDeskSettings([...rows(), { key: 'meta_token', value: 'x' }]).readable).toBe(true);
    });
});

describe('readDeskSettings', () => {
    it.each(['XX000', 'TIMEOUT', '42501'])('S13 a failed read (%s) gives the all-off object', async (code) => {
        const fake = createFakeDeskRepo();
        fake.failNext('readSettingRows', code);
        const { settings, raw } = await readDeskSettings(fake);
        expect(settings).toEqual(allOffDeskSettings());
        expect(settings).toMatchObject({
            readable: false, engine_enabled: false, inline_hooks: false, ui_enabled: false, cutover_redirect: false,
            ack_suppress: 'off', go_live_at: null, reopen_window_hours: 2, number_queues: {},
        });
        expect(raw).toEqual({});
    });

    it('returns the stored text of every row', async () => {
        const { raw } = await readDeskSettings(createFakeDeskRepo({ settings: defaultSettings({ desk_go_live_at: 'garbage' }) }));
        expect(raw.desk_go_live_at).toBe('garbage');
    });
});

describe('getDeskSettings', () => {
    beforeEach(clearDeskSettingsCache);

    it('S14 caches a successful read for 30 seconds', async () => {
        const fake = createFakeDeskRepo();
        let nowMs = 1_000_000;
        const deps = { repo: fake, clock: () => nowMs };
        await getDeskSettings(deps);
        nowMs += 10_000;
        await getDeskSettings(deps);
        expect(fake.calls.readSettingRows).toBe(1);
        nowMs += 21_000;
        await getDeskSettings(deps);
        expect(fake.calls.readSettingRows).toBe(2);
        clearDeskSettingsCache();
        await getDeskSettings(deps);
        expect(fake.calls.readSettingRows).toBe(3);
    });

    it('S14 does not cache a failed read', async () => {
        const fake = createFakeDeskRepo();
        let nowMs = 1_000_000;
        const deps = { repo: fake, clock: () => nowMs };
        fake.failNext('readSettingRows', 'XX000');
        expect((await getDeskSettings(deps)).readable).toBe(false);
        nowMs += 1000;
        expect((await getDeskSettings(deps)).readable).toBe(true);
        expect(fake.calls.readSettingRows).toBe(2);
    });
});

describe('desk_staff_phones (P1e)', () => {
    it.each([
        ['["9876543210","9000000001"]', ['9000000001', '9876543210']],
        ['["9876543210","9876543210"]', ['9876543210']],
        ['["9876543210", 5, "12", null]', ['9876543210']],
        ['[]', []],
        ['', []],
        ['not json', []],
        ['{"a":"9876543210"}', []],
        ['"9876543210"', []],
        [null, []],
    ] as const)('SP1 %j -> %j', (value, expected) => {
        expect(parse('desk_staff_phones', value).staff_phones).toEqual(expected);
    });
    it('SP2 a missing row and the all-off object give an empty list', () => {
        expect(parseDeskSettings(rows({}, ['desk_staff_phones'])).staff_phones).toEqual([]);
        expect(allOffDeskSettings().staff_phones).toEqual([]);
    });
});
