/**
 * Unit tests for the counter's spoken announcements (src/lib/stall/announce.ts).
 *
 * The rules are about state HISTORY, not about which button an operator pressed,
 * and history bugs do not show up in a typecheck. The one that matters most is
 * the silent case: a ticket handed straight over without ever being called
 * must NOT be announced, because at a counter a spurious "token 12" sends the
 * wrong customer forward.
 */

import { describe, it, expect } from 'vitest';
import { diffForAnnouncements, snapshot, phraseFor } from '@/lib/stall/announce';

const ticket = (id: number, state: string, token: number | null = id, balance_due = 0) =>
    ({ id, token, state, balance_due });

describe('diffForAnnouncements', () => {
    it('says NOTHING on the first poll', () => {
        // Opening the board must not read out every ticket already waiting.
        expect(diffForAnnouncements(null, [ticket(1, 'new'), ticket(2, 'ready')])).toEqual([]);
    });

    it('announces a new paid order arriving on the board', () => {
        const before = snapshot([ticket(1, 'new')]);
        expect(diffForAnnouncements(before, [ticket(1, 'new'), ticket(2, 'new')]))
            .toEqual([{ kind: 'new', token: 2 }]);
    });

    it('announces new → ready', () => {
        const before = snapshot([ticket(7, 'new')]);
        expect(diffForAnnouncements(before, [ticket(7, 'ready')]))
            .toEqual([{ kind: 'ready', token: 7 }]);
    });

    it('is SILENT when a ticket goes straight from new to handed over', () => {
        // Rule 3. handed_over leaves the board, so the ticket simply disappears
        // — and a disappearance must never produce a call.
        const before = snapshot([ticket(7, 'new')]);
        expect(diffForAnnouncements(before, [])).toEqual([]);
    });

    it('is silent when a READY ticket is handed over', () => {
        // It was already called once. Calling it again as it leaves would send a
        // second customer forward.
        const before = snapshot([ticket(7, 'ready')]);
        expect(diffForAnnouncements(before, [])).toEqual([]);
    });

    it('does not repeat "ready" while a ticket sits in the ready lane', () => {
        const before = snapshot([ticket(7, 'ready')]);
        expect(diffForAnnouncements(before, [ticket(7, 'ready')])).toEqual([]);
    });

    it('announces a top-up payment landing', () => {
        const before = snapshot([ticket(3, 'new', 3, 130)]);
        expect(diffForAnnouncements(before, [ticket(3, 'new', 3, 0)]))
            .toEqual([{ kind: 'paid', token: 3 }]);
    });

    it('does not announce payment for a ticket that never owed anything', () => {
        const before = snapshot([ticket(3, 'new', 3, 0)]);
        expect(diffForAnnouncements(before, [ticket(3, 'new', 3, 0)])).toEqual([]);
    });

    it('announces arrival ONCE, not arrival plus payment', () => {
        // The board only carries paid orders, so arriving already means the money
        // landed. Saying both would be two calls for one event.
        const before = snapshot([]);
        expect(diffForAnnouncements(before, [ticket(5, 'new', 5, 0)]))
            .toEqual([{ kind: 'new', token: 5 }]);
    });

    it('handles several tickets changing in one poll', () => {
        const before = snapshot([ticket(1, 'new'), ticket(2, 'new')]);
        const events = diffForAnnouncements(before, [
            ticket(1, 'ready'), ticket(2, 'new'), ticket(3, 'new'),
        ]);
        expect(events).toContainEqual({ kind: 'ready', token: 1 });
        expect(events).toContainEqual({ kind: 'new', token: 3 });
        expect(events).toHaveLength(2);
    });

    it('can both take a payment and go ready in the same poll', () => {
        const before = snapshot([ticket(4, 'new', 4, 130)]);
        const events = diffForAnnouncements(before, [ticket(4, 'ready', 4, 0)]);
        expect(events).toEqual([
            { kind: 'paid', token: 4 },
            { kind: 'ready', token: 4 },
        ]);
    });
});

describe('phraseFor', () => {
    it('spaces the digits so they carry across a counter', () => {
        // "1 2" survives a fallback voice; "twelve" pronounced oddly does not.
        expect(phraseFor({ kind: 'ready', token: 12 })).toContain('1 2');
    });

    it('says something distinct for each event', () => {
        const said = ['new', 'ready', 'paid'].map(
            (kind) => phraseFor({ kind, token: 9 } as Parameters<typeof phraseFor>[0]),
        );
        expect(new Set(said).size).toBe(3);
        expect(said.every((p) => p?.includes('9'))).toBe(true);
    });

    it('says nothing at all without a token', () => {
        // Shouting "token null" across a stall is worse than silence.
        expect(phraseFor({ kind: 'ready', token: null })).toBeNull();
    });
});
