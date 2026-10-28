// Pure formatting and parsing for the Desk screens. Every time shown to a person is IST, computed by
// shifting the epoch by 330 minutes and reading UTC fields, so the process time zone never matters.
// Nothing here reads the clock: a function that needs "now" takes it as an argument.

import { IST_OFFSET, STATS_MAX_DAYS, TICKET_TYPES, TICK_STALE_SECS, type TicketType } from './constants';
import { IST_OFFSET_MINUTES, isIstDate } from './business-hours';
import type { Category, DeskHealth, TicketListItem, TicketView } from './types';

export const DESK_TABS = ['all', 'mine', 'unassigned', 'wrap_up'] as const;
export type DeskTab = (typeof DESK_TABS)[number];

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const TICKET_PARAM = /^[1-9][0-9]{0,11}$/;
const BUSINESS_NUMBER = /^[0-9]{8,15}$/;
const HHMM = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

const pad2 = (value: number): string => String(value).padStart(2, '0');

interface IstParts { year: number; month: number; day: number; hour: number; minute: number }

function istParts(epochMs: number): IstParts {
    const shifted = new Date(epochMs + IST_OFFSET_MINUTES * MS_PER_MINUTE);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(),
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
    };
}

// ── URL state ──────────────────────────────────────────────────────────────

export function parseTicketParam(value: string | null): number | null {
    return value !== null && TICKET_PARAM.test(value) ? Number(value) : null;
}

export function parseTabParam(value: string | null): DeskTab {
    return DESK_TABS.find((tab) => tab === value) ?? 'all';
}

/** 'all' is the default tab and is left out of the URL. */
export function deskHref(ticketNo: number | null, tab: DeskTab): string {
    const parts: string[] = [];
    if (ticketNo !== null) parts.push(`ticket=${ticketNo}`);
    if (tab !== 'all') parts.push(`tab=${tab}`);
    return parts.length === 0 ? '/desk' : `/desk?${parts.join('&')}`;
}

/** A business number as digits only links to that number's inbox; null or 'default' links to /whatsapp. */
export function inboxHref(integratedNumber: string | null): string {
    return integratedNumber !== null && BUSINESS_NUMBER.test(integratedNumber)
        ? `/whatsapp/${integratedNumber}`
        : '/whatsapp';
}

// ── Durations and times ────────────────────────────────────────────────────

export function formatWaiting(secs: number | null): string {
    if (secs === null || !Number.isFinite(secs)) return '—';
    const totalMinutes = Math.floor(Math.max(0, secs) / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60) % 24;
    const days = Math.floor(totalMinutes / (60 * 24));
    if (days > 0) return `${days}d ${hours}h`;
    if (totalMinutes >= 60) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

/** Seconds waited as of nowMs; the server's figure when the clock is not known yet (nowMs is 0 before mount). */
export function waitingSecsAt(attentionSince: string | null, nowMs: number, fallback: number | null): number | null {
    if (nowMs === 0 || attentionSince === null) return fallback;
    const since = Date.parse(attentionSince);
    if (Number.isNaN(since)) return fallback;
    return Math.max(0, Math.floor((nowMs - since) / 1000));
}

export function formatIstDateTime(iso: string | null): string {
    if (iso === null) return '—';
    const epochMs = Date.parse(iso);
    if (Number.isNaN(epochMs)) return '—';
    const p = istParts(epochMs);
    return `${pad2(p.day)} ${MONTHS[p.month]} ${p.year}, ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** An instant written as an IST wall-clock ISO string with a +05:30 offset, whole minutes. */
function istIsoOf(epochMs: number): string {
    const p = istParts(epochMs);
    return `${p.year}-${pad2(p.month + 1)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:00${IST_OFFSET}`;
}

export function istIsoAt(istDate: string, hhmm: string): string {
    return `${istDate}T${hhmm}:00${IST_OFFSET}`;
}

/** nowMs plus `minutes`, floored to the minute, written in IST. */
export function istIsoAfter(nowMs: number, minutes: number): string {
    const target = nowMs + minutes * MS_PER_MINUTE;
    return istIsoOf(Math.floor(target / MS_PER_MINUTE) * MS_PER_MINUTE);
}

/** The next IST wall-clock time `hhmm` strictly after nowMs. */
export function nextIstClockIso(nowMs: number, hhmm: string): string {
    const match = HHMM.exec(hhmm);
    const minutesOfDay = match === null ? 0 : Number(match[1]) * 60 + Number(match[2]);
    const istNow = nowMs + IST_OFFSET_MINUTES * MS_PER_MINUTE;
    const istMidnight = Math.floor(istNow / MS_PER_DAY) * MS_PER_DAY;
    const todayAt = istMidnight + minutesOfDay * MS_PER_MINUTE;
    const targetShifted = todayAt > istNow ? todayAt : todayAt + MS_PER_DAY;
    return istIsoOf(targetShifted - IST_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function validateRange(from: string, to: string): 'ok' | 'invalid' | 'to_before_from' | 'too_large' {
    if (!isIstDate(from) || !isIstDate(to)) return 'invalid';
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY + 1;
    if (days < 1) return 'to_before_from';
    return days > STATS_MAX_DAYS ? 'too_large' : 'ok';
}

// ── Tickets ────────────────────────────────────────────────────────────────

/** True when the ticket has a customer message that the viewer has not marked as seen. */
export function isNewerInbound(current: string | null, seen: string | null): boolean {
    if (current === null) return false;
    if (seen === null) return true;
    return current !== seen && Date.parse(current) >= Date.parse(seen);
}

export function listItemDiffers(item: TicketListItem, ticket: TicketView): boolean {
    return item.last_inbound_at !== ticket.last_inbound_at
        || item.status !== ticket.status
        || item.assigned_to !== ticket.assigned_to
        || item.category_slug !== ticket.category_slug
        || item.follow_up_at !== ticket.follow_up_at
        || item.resolved_at !== ticket.resolved_at;
}

export function categoryLabel(slug: string | null, bySlug: ReadonlyMap<string, Category>): string {
    if (slug === null) return 'Unclassified';
    return bySlug.get(slug)?.label ?? slug;
}

// ── Health strip ───────────────────────────────────────────────────────────

export interface HealthSummary { level: 'ok' | 'warn' | 'stale' | 'error'; text: string }

export function healthSummary(health: DeskHealth): HealthSummary {
    if (!health.installed) {
        return { level: 'error', text: `Desk tables are not installed (missing: ${health.missing.join(', ')}).` };
    }
    if (!health.serviceKeyPresent || !health.canWrite) {
        return { level: 'error', text: 'Desk cannot write to the database. Tell the manager.' };
    }
    if (!health.flags.desk_engine_enabled) {
        return { level: 'warn', text: 'Ticket engine is switched off. No new tickets are being created.' };
    }
    if (!health.flags.go_live_valid) {
        return { level: 'warn', text: 'Go-live time is not set. No new tickets are being created.' };
    }
    const age = health.lastTickAgeSeconds;
    if (age === null) return { level: 'stale', text: 'Ticket engine has never run.' };
    if (age > TICK_STALE_SECS) return { level: 'stale', text: `Ticket engine last ran ${formatWaiting(age)} ago.` };
    const stats = health.lastTickStats;
    const lastTick = `Last tick ${age}s ago`;
    if (stats === null) return { level: 'ok', text: lastTick };
    const failed = `failed replies (24 h): ${stats.failed_replies_24h}`;
    if (stats.orphans > 0) {
        const count = `${stats.orphans}${stats.orphans_capped ? '+' : ''}`;
        const oldest = formatWaiting(stats.oldest_orphan_age_s);
        return { level: 'warn', text: `${lastTick} · ${count} messages without a ticket (oldest ${oldest}) · ${failed}` };
    }
    return { level: 'ok', text: `${lastTick} · no orphans · ${failed}` };
}

// ── Category lists ─────────────────────────────────────────────────────────

export interface CategoryGroup { type: TicketType; items: Category[] }

/** Groups in TICKET_TYPES order; inside a group the order received (sort_order) is kept. Empty groups are left out. */
export function groupCategoriesByType(categories: readonly Category[]): CategoryGroup[] {
    return TICKET_TYPES
        .map((type) => ({ type, items: categories.filter((category) => category.type === type) }))
        .filter((group) => group.items.length > 0);
}
