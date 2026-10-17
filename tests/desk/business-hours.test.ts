/**
 * IST helpers (table 8.8) and business-time arithmetic (tables DW, BT, BS of 8.11).
 * Every fixture instant carries an explicit offset, so the suite is identical in any
 * process time zone: the helpers shift the epoch and read UTC fields only.
 */

import { describe, it, expect } from 'vitest';
import {
    addIstDays,
    businessSecondsBetween,
    isBusinessTime,
    isIstDate,
    istClockToUtc,
    istDateOf,
    istDayOfWeek,
    istDayStartUtc,
    istMinutesOfDay,
    istRangeUtc,
    istToday,
    naiveIstToIso,
    parseHHMM,
} from '@/lib/desk/business-hours';

type CallVector = [label: string, actual: () => unknown, expected: unknown];

const DEF = { start: '05:30', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] };
const NO_SUN = { start: '05:30', end: '22:00', days: [1, 2, 3, 4, 5, 6] };
const OVERNIGHT = { start: '22:00', end: '05:30', days: [0, 1, 2, 3, 4, 5, 6] };
const NO_DAYS = { start: '05:30', end: '22:00', days: [] as number[] };
const BAD = { start: '5:30', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] };

const IST_VECTORS: CallVector[] = [
    ['istDateOf utc evening', () => istDateOf('2026-10-11T23:40:00.000Z'), '2026-10-12'],
    ['istDateOf last ms of the day', () => istDateOf('2026-10-12T18:29:59.999Z'), '2026-10-12'],
    ['istDateOf first ms of the next day', () => istDateOf('2026-10-12T18:30:00.000Z'), '2026-10-13'],
    ['istDateOf with offset', () => istDateOf('2026-10-12T05:10:00+05:30'), '2026-10-12'],
    ['istToday', () => istToday(new Date('2026-10-12T18:45:00.000Z')), '2026-10-13'],
    ['istDayStartUtc', () => istDayStartUtc('2026-10-12').toISOString(), '2026-10-11T18:30:00.000Z'],
    [
        'istRangeUtc one day',
        () => istRangeUtc('2026-10-12', '2026-10-12'),
        { gte: '2026-10-11T18:30:00.000Z', lt: '2026-10-12T18:30:00.000Z' },
    ],
    [
        'istRangeUtc a month',
        () => istRangeUtc('2026-10-01', '2026-10-31'),
        { gte: '2026-09-30T18:30:00.000Z', lt: '2026-10-31T18:30:00.000Z' },
    ],
    ['addIstDays month end', () => addIstDays('2026-10-31', 1), '2026-11-01'],
    ['addIstDays back over February', () => addIstDays('2026-03-01', -1), '2026-02-28'],
    ['addIstDays leap day', () => addIstDays('2028-02-28', 1), '2028-02-29'],
    ['istMinutesOfDay 05:10', () => istMinutesOfDay('2026-10-11T23:40:00.000Z'), 310],
    ['istMinutesOfDay 22:00', () => istMinutesOfDay('2026-10-12T16:30:00.000Z'), 1320],
    ['istClockToUtc 22:00', () => istClockToUtc('2026-10-12', '22:00')?.toISOString(), '2026-10-12T16:30:00.000Z'],
    ['istClockToUtc 05:30', () => istClockToUtc('2026-10-12', '05:30')?.toISOString(), '2026-10-12T00:00:00.000Z'],
    ['parseHHMM', () => [parseHHMM('22:00'), parseHHMM('24:00'), parseHHMM('9:5')], [1320, null, null]],
    [
        'isIstDate',
        () => [isIstDate('2026-10-12'), isIstDate('2026-02-30'), isIstDate('12-10-2026'), isIstDate('2026-10-12T00:00')],
        [true, false, false, false],
    ],
    ['naiveIstToIso', () => naiveIstToIso('2026-10-12 05:10:00'), '2026-10-12T05:10:00+05:30'],
    ['naiveIstToIso rejects a zoned string', () => naiveIstToIso('2026-10-12T05:10:00Z'), null],
];

const DAY_OF_WEEK_VECTORS: CallVector[] = [
    ['DW1', () => istDayOfWeek('2026-10-10'), 6],
    ['DW2', () => istDayOfWeek('2026-10-11'), 0],
    ['DW3', () => istDayOfWeek('2026-10-12'), 1],
    ['DW4', () => istDayOfWeek(istDateOf('2026-10-11T19:00:00.000Z')), 1],
];

const BUSINESS_TIME_VECTORS: CallVector[] = [
    ['BT01', () => isBusinessTime('2026-10-12T05:29:59+05:30', DEF), false],
    ['BT02', () => isBusinessTime('2026-10-12T05:30:00+05:30', DEF), true],
    ['BT03', () => isBusinessTime('2026-10-12T21:59:59+05:30', DEF), true],
    ['BT04', () => isBusinessTime('2026-10-12T22:00:00+05:30', DEF), false],
    ['BT05', () => isBusinessTime('2026-10-11T10:00:00+05:30', NO_SUN), false],
    ['BT06', () => isBusinessTime('2026-10-12T10:00:00+05:30', NO_SUN), true],
    ['BT07', () => isBusinessTime('2026-10-12T23:30:00+05:30', OVERNIGHT), true],
    ['BT08', () => isBusinessTime('garbage', DEF), false],
    ['BT09', () => isBusinessTime('2026-10-11T23:40:00.000Z', DEF), false],
    ['BT10', () => isBusinessTime(new Date('2026-10-12T00:00:00.000Z'), DEF), true],
];

const BUSINESS_SECONDS_VECTORS: CallVector[] = [
    ['BS01', () => businessSecondsBetween('2026-10-12T08:00:00+05:30', '2026-10-12T08:20:00+05:30', DEF), 1200],
    ['BS02', () => businessSecondsBetween('2026-10-12T21:50:00+05:30', '2026-10-12T22:10:00+05:30', DEF), 600],
    ['BS03', () => businessSecondsBetween('2026-10-12T23:00:00+05:30', '2026-10-13T06:00:00+05:30', DEF), 1800],
    ['BS04', () => businessSecondsBetween('2026-10-12T04:00:00+05:30', '2026-10-12T05:00:00+05:30', DEF), 0],
    ['BS05', () => businessSecondsBetween('2026-10-12T00:00:00+05:30', '2026-10-13T00:00:00+05:30', DEF), 59400],
    ['BS06', () => businessSecondsBetween('2026-10-12T21:00:00+05:30', '2026-10-14T06:00:00+05:30', DEF), 64800],
    ['BS07', () => businessSecondsBetween('2026-10-10T21:00:00+05:30', '2026-10-12T06:00:00+05:30', NO_SUN), 5400],
    ['BS08', () => businessSecondsBetween('2026-10-12T08:20:00+05:30', '2026-10-12T08:00:00+05:30', DEF), 0],
    ['BS09', () => businessSecondsBetween('2026-10-12T08:00:00+05:30', '2026-10-12T08:00:00+05:30', DEF), 0],
    ['BS10', () => businessSecondsBetween('2026-10-12T23:00:00+05:30', '2026-10-12T23:10:00+05:30', DEF), 0],
    ['BS11', () => businessSecondsBetween('2026-10-12T23:00:00+05:30', '2026-10-12T23:10:00+05:30', OVERNIGHT), 600],
    ['BS12', () => businessSecondsBetween('2026-10-12T23:00:00+05:30', '2026-10-12T23:10:00+05:30', NO_DAYS), 600],
    ['BS13', () => businessSecondsBetween('2026-10-12T23:00:00+05:30', '2026-10-12T23:10:00+05:30', BAD), 600],
    ['BS14', () => businessSecondsBetween('2026-10-12T08:00:00.000+05:30', '2026-10-12T08:00:01.999+05:30', DEF), 1],
    [
        'BS15',
        () => businessSecondsBetween('2026-10-12T02:30:00.000Z', new Date('2026-10-12T02:50:00.000Z'), DEF),
        1200,
    ],
    ['BS16', () => businessSecondsBetween('2026-10-11T23:40:00.000Z', '2026-10-12T00:10:00.000Z', DEF), 600],
    ['BS17', () => businessSecondsBetween('garbage', '2026-10-12T08:00:00+05:30', DEF), 0],
    ['BS18', () => businessSecondsBetween('2026-08-12T10:00:00+05:30', '2026-10-12T10:00:00+05:30', DEF), 3623400],
    ['BS19', () => businessSecondsBetween('2026-08-11T10:00:00+05:30', '2026-10-12T10:00:00+05:30', DEF), 5356800],
    ['BS20', () => businessSecondsBetween('2026-07-01T00:00:00.000Z', '2026-10-12T00:00:00.000Z', DEF), 8899200],
];

describe('IST helpers', () => {
    it.each(IST_VECTORS)('%s', (_label, actual, expected) => {
        expect(actual()).toEqual(expected);
    });

    it('carries every vector of the spec', () => {
        expect(IST_VECTORS).toHaveLength(19);
    });

    it('returns null for an invalid clock time or date', () => {
        expect(istClockToUtc('2026-02-30', '10:00')).toBeNull();
        expect(istClockToUtc('2026-10-12', '24:00')).toBeNull();
    });

    it('rejects non-strings and impossible naive timestamps', () => {
        expect(isIstDate(20261012)).toBe(false);
        expect(isIstDate(null)).toBe(false);
        expect(naiveIstToIso('2026-10-12 24:00:00')).toBeNull();
        expect(naiveIstToIso('2026-10-12 05:60:00')).toBeNull();
        expect(naiveIstToIso('2026-02-30 05:10:00')).toBeNull();
    });
});

describe('istDayOfWeek', () => {
    it.each(DAY_OF_WEEK_VECTORS)('%s', (_label, actual, expected) => {
        expect(actual()).toBe(expected);
    });
});

describe('isBusinessTime', () => {
    it.each(BUSINESS_TIME_VECTORS)('%s', (_label, actual, expected) => {
        expect(actual()).toBe(expected);
    });
});

describe('businessSecondsBetween', () => {
    it.each(BUSINESS_SECONDS_VECTORS)('%s', (_label, actual, expected) => {
        expect(actual()).toBe(expected);
    });

    it('carries every vector of the spec', () => {
        expect(DAY_OF_WEEK_VECTORS).toHaveLength(4);
        expect(BUSINESS_TIME_VECTORS).toHaveLength(10);
        expect(BUSINESS_SECONDS_VECTORS).toHaveLength(20);
    });
});
