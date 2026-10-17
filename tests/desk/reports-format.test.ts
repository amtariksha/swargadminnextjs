/**
 * Display helpers of the Desk reports: durations (FD), rates (FR), percentages (FP), names (HU),
 * IST instants (FI) and the date-range guard (RP). Pure, so they run in the node test environment.
 */

import { describe, expect, it } from 'vitest';
import {
    formatDuration, formatIst, formatIstDay, formatIstWindow, formatPct, formatRate, humanise, rangeProblem,
} from '@/components/desk/reports/format';

describe('reports format', () => {
    it.each([
        [null, '—'], [45, '45s'], [300, '5m'], [3600, '1h 0m'], [5400, '1h 30m'], [63000, '17h 30m'], [90000, '1d 1h'],
        [0, '0s'], [59, '59s'], [3599, '59m'], [86399, '23h 59m'],
    ])('FD formatDuration(%s)', (secs, expected) => {
        expect(formatDuration(secs)).toBe(expected);
    });

    it.each([[null, '—'], [0.25, '25%'], [0.5, '50%'], [0.3333, '33.3%'], [0, '0%'], [1, '100%']])('FR formatRate(%s)', (value, expected) => {
        expect(formatRate(value)).toBe(expected);
    });

    it.each([[null, '—'], [85.7, '85.7%'], [100, '100%'], [0, '0%']])('FP formatPct(%s)', (value, expected) => {
        expect(formatPct(value)).toBe(expected);
    });

    it.each([[null, 'Not recorded'], ['', 'Not recorded'], ['product_quality', 'Product quality'], ['cold_chain', 'Cold chain']])('HU humanise(%s)', (value, expected) => {
        expect(humanise(value)).toBe(expected);
    });
});

describe('IST display', () => {
    it('FI1 shows an instant in IST whatever the process time zone is', () => {
        expect(formatIst('2026-10-11T23:40:00.000Z')).toBe('12 Oct 05:10');
        expect(formatIst('2026-10-14T04:30:00.000Z')).toBe('14 Oct 10:00');
    });

    it('FI2 midnight in IST is 00:00, not 24:00', () => {
        expect(formatIst('2026-10-11T18:30:00.000Z')).toBe('12 Oct 00:00');
    });

    it('FI3 an unreadable or missing instant is a dash', () => {
        expect(formatIst(null)).toBe('—');
        expect(formatIst('garbage')).toBe('—');
    });

    it('FI4 the review window', () => {
        expect(formatIstWindow('2026-10-11T18:30:00.000Z', '2026-10-14T04:30:00.000Z')).toBe('12 Oct 00:00 – 14 Oct 10:00');
    });

    it('FI5 a day label does not shift with the time zone', () => {
        expect(formatIstDay('2026-10-12')).toBe('12 Oct');
        expect(formatIstDay('2026-01-01')).toBe('1 Jan');
    });
});

describe('rangeProblem', () => {
    it.each([
        ['RP1 a week', '2026-10-07', '2026-10-13', null],
        ['RP2 92 days', '2026-07-02', '2026-10-01', null],
        ['RP3 93 days', '2026-07-01', '2026-10-01', 'Choose at most 92 days.'],
        ['RP4 inverted', '2026-10-13', '2026-10-12', 'The end date is before the start date.'],
        ['RP5 a cleared input', '', '2026-10-12', 'Choose a start and an end date.'],
    ])('%s', (_id, from, to, expected) => {
        expect(rangeProblem(from, to, 92)).toBe(expected);
    });
});
