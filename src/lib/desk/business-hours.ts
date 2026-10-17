// IST calendar and business-time arithmetic for Desk. IST is UTC+05:30 with no daylight saving,
// so every function shifts the epoch by a fixed 330 minutes and reads UTC fields. Nothing here
// touches the process time zone (Vercel runs in UTC, a laptop does not), and nothing reads a
// clock: a function that needs "now" takes it as an argument.

import { IST_OFFSET } from './constants';
import type { BusinessHours } from './types';

export const IST_OFFSET_MINUTES = 330;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MAX_BUSINESS_SPAN_DATES = 62;
const IST_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const NAIVE_IST_REGEX = /^(\d{4}-\d{2}-\d{2}) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;

function toMs(instant: string | Date): number {
    return instant instanceof Date ? instant.getTime() : Date.parse(instant);
}

function dateStartMsUtc(istDate: string): number {
    return Date.parse(`${istDate}T00:00:00.000Z`);
}

function shifted(instant: string | Date): Date {
    return new Date(toMs(instant) + IST_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function isIstDate(value: unknown): value is string {
    if (typeof value !== 'string' || !IST_DATE_REGEX.test(value)) return false;
    const ms = dateStartMsUtc(value);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

export function istDateOf(instant: string | Date): string {
    return shifted(instant).toISOString().slice(0, 10);
}

export function istToday(now: Date): string {
    return istDateOf(now);
}

export function istDayStartUtc(istDate: string): Date {
    return new Date(dateStartMsUtc(istDate) - IST_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function addIstDays(istDate: string, days: number): string {
    return new Date(dateStartMsUtc(istDate) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function istRangeUtc(from: string, to: string): { gte: string; lt: string } {
    return {
        gte: istDayStartUtc(from).toISOString(),
        lt: istDayStartUtc(addIstDays(to, 1)).toISOString(),
    };
}

export function istMinutesOfDay(instant: string | Date): number {
    const local = shifted(instant);
    return local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function parseHHMM(value: unknown): number | null {
    if (typeof value !== 'string') return null;
    const match = HHMM_REGEX.exec(value);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function istClockToUtc(istDate: string, hhmm: string): Date | null {
    const minutes = parseHHMM(hhmm);
    if (!isIstDate(istDate) || minutes === null) return null;
    return new Date(istDayStartUtc(istDate).getTime() + minutes * MS_PER_MINUTE);
}

export function naiveIstToIso(naive: string): string | null {
    const match = typeof naive === 'string' ? NAIVE_IST_REGEX.exec(naive) : null;
    if (!match || !isIstDate(match[1])) return null;
    return `${match[1]}T${match[2]}:${match[3]}:${match[4]}${IST_OFFSET}`;
}

// ── Business time ──────────────────────────────────────────────────────────

interface UsableHours {
    startMinutes: number;
    endMinutes: number;
    days: ReadonlySet<number>;
}

export function istDayOfWeek(istDate: string): number {
    return new Date(dateStartMsUtc(istDate)).getUTCDay();
}

/** null = unusable (overnight window, bad HH:MM, empty or invalid days): callers fall back to wall-clock time. */
function usableHours(hours: BusinessHours): UsableHours | null {
    if (typeof hours !== 'object' || hours === null) return null;
    const startMinutes = parseHHMM(hours.start);
    const endMinutes = parseHHMM(hours.end);
    if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) return null;
    const { days } = hours;
    if (!Array.isArray(days) || days.length === 0) return null;
    if (!days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) return null;
    return { startMinutes, endMinutes, days: new Set<number>(days) };
}

/** [start, end) of the business window on an IST date, in epoch ms; null when that weekday has none. */
function windowOf(istDate: string, usable: UsableHours): [number, number] | null {
    if (!usable.days.has(istDayOfWeek(istDate))) return null;
    const dayStart = istDayStartUtc(istDate).getTime();
    return [dayStart + usable.startMinutes * MS_PER_MINUTE, dayStart + usable.endMinutes * MS_PER_MINUTE];
}

export function isBusinessTime(instant: string | Date, hours: BusinessHours): boolean {
    const ms = toMs(instant);
    if (Number.isNaN(ms)) return false;
    const usable = usableHours(hours);
    if (usable === null) return true;
    const window = windowOf(istDateOf(instant), usable);
    return window !== null && ms >= window[0] && ms < window[1];
}

export function businessSecondsBetween(from: string | Date, to: string | Date, hours: BusinessHours): number {
    const fromMs = toMs(from);
    const toMsValue = toMs(to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMsValue) || toMsValue <= fromMs) return 0;
    const wallClockSeconds = Math.floor((toMsValue - fromMs) / 1000);
    const usable = usableHours(hours);
    if (usable === null) return wallClockSeconds;
    const firstDate = istDateOf(from);
    const lastDate = istDateOf(to);
    const dateCount = (dateStartMsUtc(lastDate) - dateStartMsUtc(firstDate)) / MS_PER_DAY + 1;
    if (dateCount > MAX_BUSINESS_SPAN_DATES) return wallClockSeconds;
    let overlapMs = 0;
    for (let offset = 0; offset < dateCount; offset += 1) {
        const window = windowOf(addIstDays(firstDate, offset), usable);
        if (window === null) continue;
        overlapMs += Math.max(0, Math.min(toMsValue, window[1]) - Math.max(fromMs, window[0]));
    }
    return Math.floor(overlapMs / 1000);
}
