import { format as dfFormat, parse as dfParse } from 'date-fns';

/**
 * Parse a timestamp string returned by the Swarg backend API.
 *
 * Backend convention: MySQL session timezone is IST (+05:30) and pool config
 * has `dateStrings: true`, so timestamps come back as naive IST strings:
 *   "2026-05-04 10:24:31"   (no 'T', no 'Z', no offset)
 *
 * Native `new Date("2026-05-04 10:24:31")` is implementation-defined for this
 * format — Chromium can parse it as UTC, which then displays as +5:30 ahead
 * of the actual IST time. moment.js (used by the old admin) parses this as
 * local time, which is why the old admin always rendered correctly.
 *
 * This helper always parses as local time using date-fns `parse`, matching
 * the moment.js behaviour and giving consistent IST display in Indian browsers.
 *
 * Pass-through for: Date instances, ISO strings with explicit T/Z (those are
 * already deterministic), nullish values.
 */
export function parseApiDate(input: string | Date | null | undefined): Date | null {
    if (input === null || input === undefined || input === '') return null;
    if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;

    const s = String(input).trim();
    // ISO strings with 'T' separator (and optionally Z/+offset) are unambiguous —
    // let the native Date parser handle them.
    if (s.includes('T')) {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // Naive "YYYY-MM-DD HH:mm:ss" → parse as local time
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
        const d = dfParse(s, 'yyyy-MM-dd HH:mm:ss', new Date());
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // "YYYY-MM-DD" date-only → parse as start-of-day local
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = dfParse(s, 'yyyy-MM-dd', new Date());
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // Last resort: try the native parser
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format an API timestamp string for display, with a fallback if parsing fails.
 * Equivalent to `format(parseApiDate(s), pattern)` but doesn't throw on bad input.
 */
export function formatApiDate(
    input: string | Date | null | undefined,
    pattern: string,
    fallback = '-',
): string {
    const d = parseApiDate(input);
    if (!d) return fallback;
    try {
        return dfFormat(d, pattern);
    } catch {
        return fallback;
    }
}

/**
 * Convenience: same as `parseApiDate(s).getTime()` but returns 0 on failure
 * — useful inside Array.sort comparators.
 */
export function apiDateMs(input: string | Date | null | undefined): number {
    const d = parseApiDate(input);
    return d ? d.getTime() : 0;
}
