// Pure arithmetic for the Desk stats and review pages: durations, medians, percentiles, rates and
// day buckets. Which tickets are counted for which number (populations, exclusions, stats_from)
// is decided by the caller. Nothing here reads a clock or buckets by UTC date: days are IST dates.

import { addIstDays, isIstDate, istDateOf } from './business-hours';
import type { IstDate, StatsTiming } from './types';

const MAX_RANGE_DAYS = 366;
const MS_PER_DAY = 86_400_000;

type MaybeNumber = number | null | undefined;

function roundTo(value: number, decimals: number): number {
    return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

function finiteValues(values: readonly MaybeNumber[]): number[] {
    return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function ascending(values: readonly number[]): number[] {
    return [...values].sort((a, b) => a - b);
}

export function secsBetween(from: string | null | undefined, to: string | null | undefined): number | null {
    if (typeof from !== 'string' || typeof to !== 'string') return null;
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return null;
    return Math.floor((toMs - fromMs) / 1000);
}

export function median(values: readonly MaybeNumber[]): number | null {
    const sorted = ascending(finiteValues(values));
    if (sorted.length === 0) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function percentile(values: readonly MaybeNumber[], p: number): number | null {
    const sorted = ascending(finiteValues(values));
    if (sorted.length === 0 || typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p > 100) return null;
    return sorted[Math.ceil((p * sorted.length) / 100) - 1];
}

export function timingOf(secs: readonly MaybeNumber[]): StatsTiming {
    const kept = finiteValues(secs).filter((value) => value >= 0);
    return { n: kept.length, median_secs: median(kept), p90_secs: percentile(kept, 90) };
}

function isUsableRatio(numerator: unknown, denominator: unknown): denominator is number {
    return typeof numerator === 'number' && Number.isFinite(numerator)
        && typeof denominator === 'number' && Number.isFinite(denominator) && denominator > 0;
}

/** A fraction, normally 0-1, to four decimals. */
export function rate(numerator: number, denominator: number): number | null {
    return isUsableRatio(numerator, denominator) ? roundTo(numerator / denominator, 4) : null;
}

/** A percentage to one decimal. */
export function pct(numerator: number, denominator: number): number | null {
    return isUsableRatio(numerator, denominator) ? roundTo((100 * numerator) / denominator, 1) : null;
}

export function per1000(count: number, deliveries: number | null | undefined): number | null {
    return isUsableRatio(count, deliveries) ? roundTo((1000 * count) / deliveries, 1) : null;
}

export function istDatesInRange(from: IstDate, to: IstDate): IstDate[] {
    if (!isIstDate(from) || !isIstDate(to) || from > to) return [];
    const dayCount = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / MS_PER_DAY + 1;
    if (dayCount > MAX_RANGE_DAYS) return [];
    return Array.from({ length: dayCount }, (_unused, offset) => addIstDays(from, offset));
}

function bucketOf(instant: string | null, dates: ReadonlySet<string>): string | null {
    if (typeof instant !== 'string' || !Number.isFinite(Date.parse(instant))) return null;
    const date = istDateOf(instant);
    return dates.has(date) ? date : null;
}

export function volumeByIstDay(
    rows: readonly { opened_at: string | null; resolved_at: string | null }[],
    from: IstDate,
    to: IstDate,
): Array<{ date: IstDate; opened: number; resolved: number }> {
    const dates = istDatesInRange(from, to);
    const known = new Set(dates);
    const opened = new Map<string, number>();
    const resolved = new Map<string, number>();
    for (const row of rows) {
        const openedOn = bucketOf(row.opened_at, known);
        const resolvedOn = bucketOf(row.resolved_at, known);
        if (openedOn) opened.set(openedOn, (opened.get(openedOn) ?? 0) + 1);
        if (resolvedOn) resolved.set(resolvedOn, (resolved.get(resolvedOn) ?? 0) + 1);
    }
    return dates.map((date) => ({ date, opened: opened.get(date) ?? 0, resolved: resolved.get(date) ?? 0 }));
}

export function countBy<K extends string>(
    values: readonly (string | null | undefined)[],
    keys: readonly K[],
): Record<K, number> {
    const counts = new Map<string, number>(keys.map((key) => [key, 0]));
    for (const value of values) {
        if (typeof value === 'string' && counts.has(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Object.fromEntries(counts) as Record<K, number>;
}
