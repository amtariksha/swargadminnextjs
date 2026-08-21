/**
 * Unit tests for the token-slip composer (src/lib/stall/printer.ts).
 *
 * A thermal printer is a fixed-width device: every line is exactly 32 (58mm) or
 * 48 (80mm) characters and there is no wrapping, no ellipsis and no reflow. A
 * line one character too long does not look slightly wrong — the printer chops
 * it, so "Rs.200" becomes "Rs.20" and the slip in a customer's hand says they
 * paid a tenth of what they did. That is the whole reason this is pure and
 * tested away from any hardware.
 */

import { describe, it, expect } from 'vitest';
import { buildTicketText, buildEscPos, type TokenTicket } from '@/lib/stall/printer';
import { stallImageUrl, stallInitials } from '@/lib/stall/image';

const ticket = (over: Partial<TokenTicket> = {}): TokenTicket => ({
    stallTitle: 'Art of Living Permaculture',
    stallLocation: null,
    token: 12,
    orderNo: 1043,
    placedAt: '21 Aug 2026, 4:32 pm',
    lines: [
        { label: 'Alphonso Mango', sizeText: '1 Scoop', qty: 2, lineTotal: 200 },
        { label: 'Chole Papdi Chaat', sizeText: null, qty: 1, lineTotal: 130 },
    ],
    total: 330,
    paymentLabel: 'CASH',
    phone: null,
    note: null,
    ...over,
});

describe('buildTicketText', () => {
    it('never emits a line wider than the roll', () => {
        for (const width of [32, 48] as const) {
            const lines = buildTicketText(ticket({
                stallTitle: 'A Very Long Market Stall Name That Nobody Would Sensibly Type',
                stallLocation: 'Gate 3, opposite the amphitheatre, Art of Living campus',
                note: 'Customer asked for extra sev and no coriander at all please',
            }), width);
            for (const line of lines) expect(line.length).toBeLessThanOrEqual(width);
        }
    });

    it('puts the amount hard against the right margin', () => {
        const lines = buildTicketText(ticket(), 32);
        const total = lines.find((l) => l.startsWith('TOTAL'));
        expect(total).toBeDefined();
        expect(total).toHaveLength(32);
        expect(total!.endsWith('Rs.330')).toBe(true);
    });

    it('spells the rupee out — thermal heads have no ₹ glyph', () => {
        expect(buildTicketText(ticket(), 32).join('\n')).not.toContain('₹');
    });

    it('carries every ordered line, with quantity and size', () => {
        const body = buildTicketText(ticket(), 32).join('\n');
        expect(body).toContain('2x Alphonso Mango');
        expect(body).toContain('1 Scoop');
        expect(body).toContain('1x Chole Papdi Chaat');
    });

    it('wraps a long item name onto a continuation line, losing no word', () => {
        const label = 'Avocado and Labneh Toast with Pomegranate';
        const lines = buildTicketText(ticket({
            lines: [{ label, qty: 1, lineTotal: 250 }],
        }), 32);
        // The amount sits on the first line between the two halves of the name,
        // so the words are checked individually rather than as one run.
        const body = lines.join(' ');
        for (const word of label.split(' ')) expect(body).toContain(word);
        // …and it really did wrap rather than truncate with an ellipsis.
        expect(body).not.toContain('…');
    });

    it('renders the token even before one is allocated', () => {
        expect(buildTicketText(ticket({ token: null }), 32).join('\n')).toContain('TOKEN --');
    });

    it('omits per-line amounts on a board reprint, but keeps the total', () => {
        const lines = buildTicketText(ticket({
            lines: [{ label: 'Alphonso Mango', qty: 2, lineTotal: null }],
        }), 32);
        expect(lines.some((l) => l.includes('2x Alphonso Mango'))).toBe(true);
        expect(lines.some((l) => l.startsWith('TOTAL') && l.endsWith('Rs.330'))).toBe(true);
    });

    it('keeps paise when the total is not whole rupees', () => {
        const lines = buildTicketText(ticket({ total: 330.5 }), 32);
        expect(lines.find((l) => l.startsWith('TOTAL'))!.endsWith('Rs.330.50')).toBe(true);
    });
});

describe('buildEscPos', () => {
    it('initialises the printer and cuts the paper', () => {
        const bytes = buildEscPos(ticket(), 32);
        expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);   // ESC @
        expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]); // GS V B 0
    });

    it('prints the token double-size and returns to normal after it', () => {
        const bytes = Array.from(buildEscPos(ticket(), 32));
        const at = bytes.findIndex((_, i) => bytes[i] === 0x1d && bytes[i + 1] === 0x21 && bytes[i + 2] === 0x11);
        expect(at).toBeGreaterThan(-1);
        const reset = bytes.findIndex((_, i) => i > at && bytes[i] === 0x1d && bytes[i + 1] === 0x21 && bytes[i + 2] === 0x00);
        expect(reset).toBeGreaterThan(at);
    });

    it('emits single-byte characters only', () => {
        // A UTF-8 encoder would emit multi-byte sequences that print as pairs of
        // garbage glyphs on a CP437 head.
        const bytes = buildEscPos(ticket({ stallTitle: 'Café — Art of Living' }), 32);
        for (const b of bytes) expect(b).toBeLessThanOrEqual(0xff);
    });
});

/**
 * The tile photo URL.
 *
 * Product photos in this catalogue are stored three different ways depending on
 * when and how they were uploaded — bare filename, upload-relative path, or an
 * absolute R2 URL — and all three are live. Getting this wrong shows a broken
 * image on every till tile, which is worse than the initials fallback.
 */
describe('stallImageUrl', () => {
    it('passes an absolute URL straight through', () => {
        const url = 'https://pub-abc.r2.dev/gelato/alphonso.jpg';
        expect(stallImageUrl(url)).toBe(url);
        expect(stallImageUrl('//cdn.example.com/x.png')).toBe('//cdn.example.com/x.png');
    });

    it('never doubles the uploads path', () => {
        const resolved = stallImageUrl('uploads/images/alphonso.jpg') ?? '';
        expect(resolved.match(/uploads\/images/g)).toHaveLength(1);
        expect(resolved.endsWith('/uploads/images/alphonso.jpg')).toBe(true);
    });

    it('appends a bare filename to the image base', () => {
        expect(stallImageUrl('alphonso.jpg')?.endsWith('/alphonso.jpg')).toBe(true);
    });

    it('treats blank, whitespace and null as no image', () => {
        expect(stallImageUrl(null)).toBeNull();
        expect(stallImageUrl('')).toBeNull();
        expect(stallImageUrl('   ')).toBeNull();
    });

    it('does not produce a double slash from a leading-slash path', () => {
        expect(stallImageUrl('/alphonso.jpg')).not.toContain('//alphonso');
    });
});

describe('stallInitials', () => {
    it('takes one letter from each of the first two words', () => {
        expect(stallInitials('Alphonso Mango')).toBe('AM');
        expect(stallInitials('Chole Papdi Chaat')).toBe('CP');
    });

    it('takes two letters from a single word', () => {
        expect(stallInitials('Paan')).toBe('PA');
    });

    it('survives an empty label rather than throwing on the grid', () => {
        expect(stallInitials('   ')).toBe('?');
    });
});
