/**
 * P3b formatting, parsing and health-summary vectors (spec tables 8.1 and 8.2). Every instant carries
 * an explicit offset, so the suite is identical in any process time zone.
 */

import { describe, it, expect } from 'vitest';
import {
    categoryLabel, deskHref, formatIstDateTime, formatWaiting, healthSummary, inboxHref, isNewerInbound,
    istIsoAfter, istIsoAt, listItemDiffers, nextIstClockIso, parseTabParam, parseTicketParam,
    validateRange, waitingSecsAt,
} from '@/lib/desk/ticket-format';
import type { Category, DeskHealth, TicketListItem, TicketView } from '@/lib/desk/types';

const S = '2026-10-12T02:30:00.123456+00:00';

describe('formatWaiting', () => {
    it.each([
        [null, '—'], [0, '0m'], [59, '0m'], [60, '1m'], [3599, '59m'], [3600, '1h 0m'], [5400, '1h 30m'],
        [86399, '23h 59m'], [86400, '1d 0h'], [190000, '2d 4h'],
    ])('formatWaiting(%s) is %s', (secs, expected) => {
        expect(formatWaiting(secs)).toBe(expected);
    });
});

describe('waitingSecsAt', () => {
    it('counts from the attention time to now', () => {
        expect(waitingSecsAt('2026-10-12T02:30:00+00:00', Date.parse('2026-10-12T02:45:30Z'), 5)).toBe(930);
    });
    it('falls back before the clock is known or without an attention time', () => {
        expect(waitingSecsAt('2026-10-12T02:30:00+00:00', 0, 5)).toBe(5);
        expect(waitingSecsAt(null, 1, 5)).toBe(5);
    });
});

describe('formatIstDateTime', () => {
    it.each([
        ['2026-10-11T23:40:00.000Z', '12 Oct 2026, 05:10'],
        ['2026-10-12T05:10:00+05:30', '12 Oct 2026, 05:10'],
        ['2026-10-12T18:30:00.123456+00:00', '13 Oct 2026, 00:00'],
        ['2026-12-31T18:29:59+00:00', '31 Dec 2026, 23:59'],
        [null, '—'],
        ['not a date', '—'],
    ])('formats %s as %s', (iso, expected) => {
        expect(formatIstDateTime(iso)).toBe(expected);
    });
});

describe('IST clock builders', () => {
    it('istIsoAt joins date, time and offset', () => {
        expect(istIsoAt('2026-10-12', '08:30')).toBe('2026-10-12T08:30:00+05:30');
    });
    it('istIsoAfter floors to the minute and crosses midnight', () => {
        expect(istIsoAfter(Date.parse('2026-10-12T16:45:10.000Z'), 120)).toBe('2026-10-13T00:15:00+05:30');
    });
    it.each([
        ['2026-10-12T16:45:10.000Z', '2026-10-13T08:30:00+05:30'],
        ['2026-10-11T19:00:00.000Z', '2026-10-12T08:30:00+05:30'],
        ['2026-10-12T03:00:00.000Z', '2026-10-13T08:30:00+05:30'],
        ['2026-10-12T02:59:59.000Z', '2026-10-12T08:30:00+05:30'],
    ])('nextIstClockIso(%s) is %s', (now, expected) => {
        expect(nextIstClockIso(Date.parse(now), '08:30')).toBe(expected);
    });
});

describe('URL state', () => {
    it('parseTicketParam accepts a plain positive integer only', () => {
        expect(parseTicketParam('123')).toBe(123);
        for (const bad of ['0', '-5', '12a', '00012', '', null, '1234567890123']) {
            expect(parseTicketParam(bad)).toBeNull();
        }
    });
    it('parseTabParam falls back to mine', () => {
        expect(parseTabParam('wrap_up')).toBe('wrap_up');
        expect(parseTabParam('all')).toBe('all');
        for (const bad of ['acks', 'list', null]) expect(parseTabParam(bad)).toBe('mine');
    });
    it('deskHref leaves the default tab out', () => {
        expect(deskHref(null, 'mine')).toBe('/desk');
        expect(deskHref(12, 'mine')).toBe('/desk?ticket=12');
        expect(deskHref(12, 'all')).toBe('/desk?ticket=12&tab=all');
        expect(deskHref(null, 'wrap_up')).toBe('/desk?tab=wrap_up');
    });
    it('inboxHref links a real number and falls back otherwise', () => {
        expect(inboxHref('917996196111')).toBe('/whatsapp/917996196111');
        for (const bad of ['default', null, 'abc']) expect(inboxHref(bad)).toBe('/whatsapp');
    });
});

describe('validateRange', () => {
    it.each([
        ['2026-10-01', '2026-10-07', 'ok'],
        ['2026-10-01', '2026-10-01', 'ok'],
        ['2026-10-07', '2026-10-01', 'to_before_from'],
        ['2026-07-02', '2026-10-01', 'ok'],
        ['2026-07-01', '2026-10-01', 'too_large'],
        ['2026-13-01', '2026-10-01', 'invalid'],
        ['', '2026-10-01', 'invalid'],
    ])('validateRange(%s, %s) is %s', (from, to, expected) => {
        expect(validateRange(from, to)).toBe(expected);
    });
});

describe('categoryLabel', () => {
    const map = new Map<string, Category>([['spam', { slug: 'spam', label: 'Spam' } as Category]]);
    it('prefers the label, then the slug, then Unclassified', () => {
        expect(categoryLabel('spam', map)).toBe('Spam');
        expect(categoryLabel('old_slug', map)).toBe('old_slug');
        expect(categoryLabel(null, map)).toBe('Unclassified');
    });
});

describe('isNewerInbound', () => {
    it.each([
        [null, null, false],
        [S, null, true],
        [null, S, false],
        [S, S, false],
        ['2026-10-12T02:31:00+00:00', S, true],
        ['2026-10-12T02:29:00+00:00', S, false],
        ['2026-10-12T02:30:00.123457+00:00', S, true],
    ])('isNewerInbound(%s, %s) is %s', (current, seen, expected) => {
        expect(isNewerInbound(current, seen)).toBe(expected);
    });
});

describe('listItemDiffers', () => {
    const base = {
        last_inbound_at: S, status: 'open', assigned_to: '7', category_slug: 'spam',
        follow_up_at: null, resolved_at: null,
    };
    const item = base as unknown as TicketListItem;
    const same = { ...base } as unknown as TicketView;

    it('is false when the six fields are equal', () => {
        expect(listItemDiffers(item, same)).toBe(false);
    });
    it.each([
        ['last_inbound_at', '2026-10-12T02:31:00+00:00'],
        ['status', 'resolved'],
        ['assigned_to', '8'],
        ['category_slug', 'late_delivery'],
        ['follow_up_at', '2026-10-13T02:31:00+00:00'],
        ['resolved_at', '2026-10-13T02:31:00+00:00'],
    ])('is true when %s changes', (field, value) => {
        expect(listItemDiffers(item, { ...base, [field]: value } as unknown as TicketView)).toBe(true);
    });
});

describe('healthSummary', () => {
    const healthy: DeskHealth = {
        installed: true, missing: [], canWrite: true, serviceKeyPresent: true,
        flags: {
            desk_engine_enabled: true, desk_inline_hooks: false, desk_ui_enabled: true, desk_cutover_redirect: false,
            desk_ack_suppress: 'shadow', desk_go_live_at: '2026-10-01T00:00:00+00:00', go_live_valid: true,
        },
        lastTickAt: null,
        lastTickAgeSeconds: 42,
        lastTickStats: {
            at: S, duration_ms: 10, orphans: 0, orphans_capped: false, oldest_orphan_age_s: null,
            failed_replies_24h: 0, steps: {},
        },
        error: null,
    };
    const withStats = (patch: Partial<NonNullable<DeskHealth['lastTickStats']>>): DeskHealth => ({
        ...healthy,
        lastTickStats: { ...(healthy.lastTickStats as NonNullable<DeskHealth['lastTickStats']>), ...patch },
    });

    it('is ok for a healthy engine', () => {
        expect(healthSummary(healthy)).toEqual({
            level: 'ok', text: 'Last tick 42s ago · no orphans · failed replies (24 h): 0',
        });
    });
    it('reports missing tables first', () => {
        expect(healthSummary({ ...healthy, installed: false, missing: ['desk_tickets', 'messages.ticket_id'] })).toEqual({
            level: 'error', text: 'Desk tables are not installed (missing: desk_tickets, messages.ticket_id).',
        });
    });
    it('reports a missing write path', () => {
        for (const patch of [{ canWrite: false }, { serviceKeyPresent: false }]) {
            const result = healthSummary({ ...healthy, ...patch });
            expect(result.level).toBe('error');
            expect(result.text).toContain('cannot write');
        }
    });
    it('warns when the engine is off or go-live is unset', () => {
        const off = healthSummary({ ...healthy, flags: { ...healthy.flags, desk_engine_enabled: false } });
        expect(off.level).toBe('warn');
        expect(off.text).toContain('switched off');
        const unset = healthSummary({ ...healthy, flags: { ...healthy.flags, go_live_valid: false } });
        expect(unset.level).toBe('warn');
        expect(unset.text).toContain('Go-live');
    });
    it('classifies the tick age', () => {
        expect(healthSummary({ ...healthy, lastTickAgeSeconds: null })).toEqual({
            level: 'stale', text: 'Ticket engine has never run.',
        });
        expect(healthSummary({ ...healthy, lastTickAgeSeconds: 300 }).level).toBe('ok');
        expect(healthSummary({ ...healthy, lastTickAgeSeconds: 301 })).toEqual({
            level: 'stale', text: 'Ticket engine last ran 5m ago.',
        });
    });
    it('handles missing tick stats and orphans', () => {
        expect(healthSummary({ ...healthy, lastTickStats: null })).toEqual({ level: 'ok', text: 'Last tick 42s ago' });
        expect(healthSummary(withStats({ orphans: 3, oldest_orphan_age_s: 240, failed_replies_24h: 2 }))).toEqual({
            level: 'warn',
            text: 'Last tick 42s ago · 3 messages without a ticket (oldest 4m) · failed replies (24 h): 2',
        });
        const capped = healthSummary(withStats({ orphans: 100, orphans_capped: true, oldest_orphan_age_s: 7200 }));
        expect(capped.level).toBe('warn');
        expect(capped.text).toContain('100+ messages');
    });
});
