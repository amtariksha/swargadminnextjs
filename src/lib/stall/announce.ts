/**
 * Calling tokens out loud at the counter.
 *
 * A market stall is noisy and the staff making the food have their hands full.
 * Reading a screen means stopping, so the board says it instead.
 *
 * Four rules, and the third is the one that shapes the design:
 *
 *   1. a NEW paid order arrives        → "Order 12, paid"
 *   2. a ticket is marked READY        → "Token 12, ready for collection"
 *   3. new → handed over, skipping ready → SILENT
 *   4. a QR payment lands              → "Payment received, token 12"
 *
 * Rule 3 is why this is driven by observed TRANSITIONS rather than by the
 * actions the operator takes. A ticket handed straight over was never called,
 * so announcing it would be announcing a collection that already happened — and
 * at a counter, a spurious "token 12" sends the wrong customer forward.
 *
 * Speech is best-effort throughout. It is an aid, never the record: a browser
 * with no speechSynthesis, a muted tablet or a rejected autoplay must all leave
 * the board working exactly as it does now.
 */

export type AnnounceEvent =
    | { kind: 'new'; token: number | null }
    | { kind: 'ready'; token: number | null }
    | { kind: 'paid'; token: number | null };

const STORAGE_KEY = 'stall_announce_enabled';

/**
 * Off until switched on, per device.
 *
 * Two tablets side by side at one counter would otherwise talk over each other,
 * and the office admin opening the board to check on a stall does not want their
 * laptop shouting token numbers.
 */
export function announceEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function setAnnounceEnabled(on: boolean): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
        /* private-mode storage refusal — the session keeps its in-memory copy */
    }
}

export const speechSupported = () =>
    typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * What gets said.
 *
 * Digits are spaced ("1 2", not "twelve") because a token read as a number runs
 * into the next word across a busy counter, and because en-IN voices are not
 * reliably present — a spaced digit survives falling back to a US voice, a
 * spoken "twelve" pronounced oddly does not.
 */
export function phraseFor(event: AnnounceEvent): string | null {
    if (event.token == null) return null;   // nothing useful to shout
    const digits = String(event.token).split('').join(' ');
    switch (event.kind) {
        case 'new': return `New order. Token ${digits}. Paid.`;
        case 'ready': return `Token ${digits}. Ready for collection.`;
        case 'paid': return `Payment received. Token ${digits}.`;
        default: return null;
    }
}

/**
 * Work out what to say from two consecutive polls of the board.
 *
 * Pure, and separated from the speaking so the rules can be tested without a
 * browser — rule 3 in particular is a statement about state history, which is
 * exactly the kind of thing that quietly breaks.
 *
 * @param prev  tickets from the previous poll, by order id. `null` on the very
 *              FIRST poll, which is deliberately silent: opening the board must
 *              not read out every ticket already on it.
 */
export function diffForAnnouncements(
    prev: Map<number, { state: string; balanceDue: number }> | null,
    next: { id: number; token: number | null; state: string; balance_due?: number }[],
): AnnounceEvent[] {
    if (!prev) return [];
    const events: AnnounceEvent[] = [];

    for (const t of next) {
        const before = prev.get(t.id);
        const due = Number(t.balance_due) || 0;

        if (!before) {
            // Newly on the board. The board only carries PAID orders, so arriving
            // at all means the money landed — rules 1 and 4 are the same moment
            // seen from the counter, and only one of them should be said.
            events.push({ kind: 'new', token: t.token });
            continue;
        }

        // Rule 4: it was on the board owing a top-up, and that has now cleared.
        if (before.balanceDue > 0 && due <= 0) {
            events.push({ kind: 'paid', token: t.token });
        }

        // Rule 2 — and rule 3 falls out of it. Only new → ready is called;
        // a ticket that went straight to handed_over never enters this branch
        // because handed_over rows leave the board entirely.
        if (before.state !== 'ready' && t.state === 'ready') {
            events.push({ kind: 'ready', token: t.token });
        }
    }

    return events;
}

/** Snapshot the board in the shape diffForAnnouncements compares against. */
export function snapshot(
    tickets: { id: number; state: string; balance_due?: number }[],
): Map<number, { state: string; balanceDue: number }> {
    return new Map(tickets.map((t) => [t.id, {
        state: t.state,
        balanceDue: Number(t.balance_due) || 0,
    }]));
}

/**
 * Say it. Never throws, never rejects.
 *
 * Queued rather than interrupting: two tickets going ready in the same poll must
 * both be called, and `speechSynthesis.speak` already queues. Cancelling would
 * mean the first token is cut off mid-word, which is worse than a short wait.
 */
export function speak(text: string): void {
    if (!speechSupported()) return;
    try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-IN';
        // Slower than default: this is heard once, across a counter, over noise.
        utterance.rate = 0.9;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    } catch {
        /* a device with no voices installed — the board is unaffected */
    }
}
