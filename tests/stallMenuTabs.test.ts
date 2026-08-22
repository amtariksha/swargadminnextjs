/**
 * Unit tests for stall menu category handling (src/lib/stall/menuTabs.ts).
 *
 * These exist because of a bug that shipped past a typecheck, a clean build and
 * my own read of the diff: the item form seeded its Tab field with
 * `item?.tab ?? defaultTab`, which looks obviously right and is not. An existing
 * untagged item has `tab: null`, so `??` fell through and a PRICE-ONLY edit
 * silently rewrote the item's category to whichever chip was selected.
 *
 * It was invisible everywhere an admin would look — this screen and the till
 * both display a null tab as "Other", so a row newly tagged with the literal
 * string "Other" merges straight back into the same bucket. Only the customer
 * saw it, because the public menu falls back to "Menu" instead and the item
 * therefore jumped to a second tab of its own.
 */

import { describe, it, expect } from 'vitest';
import { ALL_TABS, UNTABBED, initialTabValue, tabLabel } from '@/lib/stall/menuTabs';

const item = (tab: string | null) => ({ tab });

describe('initialTabValue — editing', () => {
    it('NEVER inherits the selected chip, even when the item has no tab', () => {
        // The regression. An untagged item edited under any chip keeps no tag.
        expect(initialTabValue(item(null), 'Gelato')).toBe('');
        expect(initialTabValue(item(null), UNTABBED)).toBe('');
        expect(initialTabValue(item(null), ALL_TABS)).toBe('');
    });

    it("keeps the item's own tab", () => {
        expect(initialTabValue(item('Gelato'), 'Chaats')).toBe('Gelato');
        expect(initialTabValue(item('Gelato'), ALL_TABS)).toBe('Gelato');
    });
});

describe('initialTabValue — adding', () => {
    it('pre-fills the selected category', () => {
        expect(initialTabValue(null, 'Gelato')).toBe('Gelato');
    });

    it('pre-fills nothing on the All chip', () => {
        expect(initialTabValue(null, ALL_TABS)).toBe('');
    });

    it('pre-fills nothing on the untagged bucket', () => {
        // "Other" is a label this screen invents for tab IS NULL. Writing it
        // would tag the new item while its siblings stayed null, splitting them
        // onto separate tabs of the customer's menu.
        expect(initialTabValue(null, UNTABBED)).toBe('');
    });

    it('does not treat a REAL category named like the sentinel as special', () => {
        // ALL_TABS is deliberately not the string 'All', so a stall may use it.
        expect(initialTabValue(null, 'All')).toBe('All');
    });
});

describe('tabLabel', () => {
    it('files every empty shape under the one bucket', () => {
        for (const empty of [null, undefined, '']) expect(tabLabel(empty)).toBe(UNTABBED);
    });

    it('passes a real category through untouched', () => {
        expect(tabLabel('Gelato')).toBe('Gelato');
    });

    it('is stable — the grouping key and the chip label are the same string', () => {
        // They are compared against each other (`tabLabel(i.tab) === activeTab`),
        // so any divergence silently empties a category.
        expect(tabLabel(null)).toBe(UNTABBED);
        expect(tabLabel(UNTABBED)).toBe(UNTABBED);
    });
});

describe('ALL_TABS', () => {
    it('cannot collide with a category anyone would type', () => {
        expect(ALL_TABS).not.toBe('All');
        expect(ALL_TABS.trim()).not.toBe('all');
    });
});
