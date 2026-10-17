/**
 * Stats aggregators: secsBetween (SB), median (MD), percentile (PC), timingOf (TM), rate (RT),
 * pct (PT), per1000 (PK), istDatesInRange (ID), volumeByIstDay (VD) and countBy (CB).
 * Pure arithmetic only; which tickets are counted for which number belongs to the stats route.
 */

import { describe, it, expect } from 'vitest';
import {
    countBy,
    istDatesInRange,
    median,
    pct,
    percentile,
    per1000,
    rate,
    secsBetween,
    timingOf,
    volumeByIstDay,
} from '@/lib/desk/stats';

type CallVector = [id: string, actual: () => unknown, expected: unknown];

const SECS_VECTORS: CallVector[] = [
    ['SB1', () => secsBetween('2026-10-12T08:00:00+05:30', '2026-10-12T08:04:30+05:30'), 270],
    ['SB2', () => secsBetween('2026-10-12T02:30:00.123456+00:00', '2026-10-12T08:00:01.999+05:30'), 1],
    ['SB3', () => secsBetween('2026-10-12T08:00:00+05:30', '2026-10-12T08:00:00+05:30'), 0],
    ['SB4', () => secsBetween('2026-10-12T08:04:00+05:30', '2026-10-12T08:00:00+05:30'), null],
    ['SB5', () => secsBetween(null, '2026-10-12T08:00:00+05:30'), null],
    ['SB6', () => secsBetween('garbage', '2026-10-12T08:00:00+05:30'), null],
];

const MEDIAN_VECTORS: CallVector[] = [
    ['MD1', () => median([]), null],
    ['MD2', () => median([5]), 5],
    ['MD3', () => median([9, 1, 5]), 5],
    ['MD4', () => median([4, 1, 3, 2]), 3],
    ['MD7', () => median([5, 9]), 7],
    ['MD5', () => median([10, null, undefined, Number.NaN, 20]), 15],
    ['MD6', () => median([7, 7, 7, 100]), 7],
];

const PERCENTILE_VECTORS: CallVector[] = [
    ['PC1', () => percentile([], 90), null],
    ['PC2', () => percentile([5], 90), 5],
    ['PC3', () => percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9],
    ['PC4', () => percentile([10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 50), 5],
    ['PC5', () => percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 90), 10],
    ['PC6', () => percentile([1, 2, 3], 100), 3],
    ['PC7', () => percentile([30, 10, 20], 1), 10],
    ['PC8', () => percentile([1, 2, 3], 0), null],
    ['PC9', () => percentile([1, 2, 3], 101), null],
];

const TIMING_VECTORS: CallVector[] = [
    ['TM1', () => timingOf([]), { n: 0, median_secs: null, p90_secs: null }],
    ['TM2', () => timingOf([120]), { n: 1, median_secs: 120, p90_secs: 120 }],
    ['TM3', () => timingOf([60, 240, 120, 600]), { n: 4, median_secs: 180, p90_secs: 600 }],
    ['TM4', () => timingOf([60, null, -5, 61, undefined, Number.NaN]), { n: 2, median_secs: 61, p90_secs: 61 }],
    ['TM5', () => timingOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]), { n: 10, median_secs: 6, p90_secs: 9 }],
];

const RATE_VECTORS: CallVector[] = [
    ['RT1', () => rate(1, 8), 0.125],
    ['RT2', () => rate(1, 3), 0.3333],
    ['RT3', () => rate(2, 3), 0.6667],
    ['RT4', () => rate(0, 5), 0],
    ['RT5', () => rate(7, 7), 1],
    ['RT6', () => rate(5, 0), null],
    ['RT7', () => rate(3, -1), null],
    ['RT8', () => rate(Number.NaN, 4), null],
];

const PCT_VECTORS: CallVector[] = [
    ['PT1', () => pct(1, 8), 12.5],
    ['PT2', () => pct(1, 3), 33.3],
    ['PT3', () => pct(2, 3), 66.7],
    ['PT4', () => pct(1, 16), 6.3],
    ['PT5', () => pct(41, 41), 100],
    ['PT6', () => pct(0, 0), null],
];

const PER_1000_VECTORS: CallVector[] = [
    ['PK1', () => per1000(7, 1234), 5.7],
    ['PK2', () => per1000(3, 1000), 3],
    ['PK3', () => per1000(12, 8450), 1.4],
    ['PK4', () => per1000(1, 3000), 0.3],
    ['PK5', () => per1000(0, 500), 0],
    ['PK6', () => per1000(5, null), null],
    ['PK7', () => per1000(5, 0), null],
];

const RANGE_VECTORS: CallVector[] = [
    ['ID1', () => istDatesInRange('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']],
    ['ID2', () => istDatesInRange('2026-10-12', '2026-10-12'), ['2026-10-12']],
    ['ID3', () => istDatesInRange('2028-02-27', '2028-03-01'), ['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']],
    ['ID4', () => istDatesInRange('2026-10-13', '2026-10-12'), []],
    ['ID5', () => istDatesInRange('2026-02-30', '2026-03-02'), []],
    ['ID6', () => istDatesInRange('2026-01-01', '2026-12-31').length, 365],
    ['ID7', () => istDatesInRange('2026-01-01', '2027-01-01').length, 366],
    ['ID8', () => istDatesInRange('2026-01-01', '2027-01-02').length, 0],
];

const ROWS = [
    { opened_at: '2026-10-11T23:40:00.000Z', resolved_at: '2026-10-12T04:00:00.000Z' },
    { opened_at: '2026-10-12T18:29:59.999Z', resolved_at: '2026-10-12T18:30:00.000Z' },
    { opened_at: '2026-10-12T05:10:00+05:30', resolved_at: null },
    { opened_at: '2026-10-11T18:29:59.999Z', resolved_at: '2026-10-13T10:00:00+05:30' },
    { opened_at: '2026-10-14T00:00:00+05:30', resolved_at: '2026-10-14T01:00:00+05:30' },
    { opened_at: 'garbage', resolved_at: 'garbage' },
];

const VOLUME_VECTORS: CallVector[] = [
    [
        'VD1',
        () => volumeByIstDay(ROWS, '2026-10-12', '2026-10-13'),
        [{ date: '2026-10-12', opened: 3, resolved: 1 }, { date: '2026-10-13', opened: 0, resolved: 2 }],
    ],
    [
        'VD2',
        () => volumeByIstDay([], '2026-10-12', '2026-10-13'),
        [{ date: '2026-10-12', opened: 0, resolved: 0 }, { date: '2026-10-13', opened: 0, resolved: 0 }],
    ],
    ['VD3', () => volumeByIstDay(ROWS, '2026-10-13', '2026-10-12'), []],
];

const TYPES = ['complaint', 'sales', 'request', 'enquiry', 'other'] as const;

const COUNT_VECTORS: CallVector[] = [
    ['CB1', () => countBy(['care', 'sales', 'care', null, 'vip', undefined], ['care', 'sales']), { care: 2, sales: 1 }],
    ['CB2', () => countBy([], TYPES), { complaint: 0, sales: 0, request: 0, enquiry: 0, other: 0 }],
    [
        'CB3',
        () => countBy(['complaint', 'complaint', 'other', 'COMPLAINT'], TYPES),
        { complaint: 2, sales: 0, request: 0, enquiry: 0, other: 1 },
    ],
];

const TABLES: Array<[name: string, vectors: CallVector[], count: number]> = [
    ['secsBetween', SECS_VECTORS, 6],
    ['median', MEDIAN_VECTORS, 7],
    ['percentile', PERCENTILE_VECTORS, 9],
    ['timingOf', TIMING_VECTORS, 5],
    ['rate', RATE_VECTORS, 8],
    ['pct', PCT_VECTORS, 6],
    ['per1000', PER_1000_VECTORS, 7],
    ['istDatesInRange', RANGE_VECTORS, 8],
    ['volumeByIstDay', VOLUME_VECTORS, 3],
    ['countBy', COUNT_VECTORS, 3],
];

describe.each(TABLES)('%s', (_name, vectors, count) => {
    it.each(vectors)('%s', (_id, actual, expected) => {
        expect(actual()).toEqual(expected);
    });

    it('carries every vector of the spec', () => {
        expect(vectors).toHaveLength(count);
    });
});

describe('stats purity', () => {
    it('does not mutate the arrays it sorts', () => {
        const values = [9, 1, 5];
        median(values);
        percentile(values, 90);
        timingOf(values);
        expect(values).toEqual([9, 1, 5]);
    });

    it('ignores a value that is not in the key list, including prototype names', () => {
        expect(countBy(['__proto__', 'constructor', 'care'], ['care'])).toEqual({ care: 1 });
    });
});
