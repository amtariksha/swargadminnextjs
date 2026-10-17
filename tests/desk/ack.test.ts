/**
 * isAckOnly: "is this whole message nothing but a thank-you or an okay?". Vectors A01-A52
 * (positives) and N01-N55 (negatives), the limit vectors AX1-AX7 and the invariants of the
 * closed lists. Emoji and other invisible code points are written with escapes so an editor
 * cannot drop them.
 */

import { describe, it, expect } from 'vitest';
import {
    ACK_CORE,
    ACK_EMOJI,
    ACK_FILLER,
    ACK_MAX_LENGTH,
    ACK_MAX_TOKENS,
    ACK_NEVER,
    ACK_PHRASES,
    ACK_TAIL_NOUNS,
    ACK_TAIL_REGEX,
    ACK_THANKS,
    isAckOnly,
} from '@/lib/desk/ack';

type AckVector = [id: string, text: string | null, contentType: string | null, hasMedia: boolean, expected: boolean];

const POSITIVE_VECTORS: AckVector[] = [
    ['A01', 'ok', 'text', false, true],
    ['A02', 'Ok', 'text', false, true],
    ['A03', 'OK.', 'text', false, true],
    ['A04', 'Okay', 'text', false, true],
    ['A05', 'k', 'text', false, true],
    ['A06', 'Kk', 'text', false, true],
    ['A07', 'okkkk', 'text', false, true],
    ['A08', 'Ok ok', 'text', false, true],
    ['A09', 'Thanks', 'text', false, true],
    ['A10', 'Thank you', 'text', false, true],
    ['A11', 'Thank u', 'text', false, true],
    ['A12', 'Thankssss', 'text', false, true],
    ['A13', 'Thank you so much', 'text', false, true],
    ['A14', 'Thanks a lot', 'text', false, true],
    ['A15', 'Thank you very much sir', 'text', false, true],
    ['A16', 'Tq', 'text', false, true],
    ['A17', 'Thnx', 'text', false, true],
    ['A18', 'Tq so much mam', 'text', false, true],
    ['A19', 'Ok thank you', 'text', false, true],
    ['A20', 'Okay sir', 'text', false, true],
    ['A21', 'Ok, thanks!', 'text', false, true],
    ['A22', 'Thanks for the update', 'text', false, true],
    ['A23', 'Thanks for the refund', 'text', false, true],
    ['A51', 'Thank you so much for the help', 'text', false, true],
    ['A52', 'You are welcome', 'text', false, true],
    ['A24', 'Noted', 'text', false, true],
    ['A25', 'Noted with thanks', 'text', false, true],
    ['A26', 'Done', 'text', false, true],
    ['A27', 'Received, thank you', 'text', false, true],
    ['A28', 'Got it', 'text', false, true],
    ['A29', 'No problem', 'text', false, true],
    ['A30', 'It\'s ok', 'text', false, true],
    ['A31', 'Super', 'text', false, true],
    ['A32', 'Great, thanks', 'text', false, true],
    ['A33', 'goood', 'text', false, true],
    ['A34', 'Theek hai', 'text', false, true],
    ['A35', 'Thik h', 'text', false, true],
    ['A36', 'Accha ji', 'text', false, true],
    ['A37', 'Shukriya', 'text', false, true],
    ['A38', 'Dhanyavad', 'text', false, true],
    ['A39', 'Sari', 'text', false, true],
    ['A40', 'Sari sir', 'text', false, true],
    ['A41', 'Aytu', 'text', false, true],
    ['A42', 'Ok aaytu thanks', 'text', false, true],
    ['A43', 'Tumba dhanyavadagalu', 'text', false, true],
    ['A44', '\u{1F44D}', 'text', false, true],
    ['A45', '\u{1F64F}\u{1F64F}\u{1F64F}', 'text', false, true],
    ['A46', '\u{1F64F}\u{1F3FB}', 'text', false, true],
    ['A47', '❤️', 'text', false, true],
    ['A48', 'Thanks \u{1F64F}', 'text', false, true],
    ['A49', '  ok  ', 'text', false, true],
    ['A50', 'ok', null, false, true],
];

const NEGATIVE_VECTORS: AckVector[] = [
    ['N01', '', 'text', false, false],
    ['N02', '   ', 'text', false, false],
    ['N03', null, 'text', false, false],
    ['N04', '', 'image', false, false],
    ['N05', 'ok', 'image', false, false],
    ['N06', 'ok', 'text', true, false],
    ['N07', 'Thanks', 'interactive', false, false],
    ['N08', '{"text":"[Location]","location":{"latitude":12.9}}', 'location', false, false],
    ['N09', 'ok?', 'text', false, false],
    ['N10', 'Ok ?', 'text', false, false],
    ['N11', 'Thanks?', 'text', false, false],
    ['N12', 'ok send 2 tomorrow', 'text', false, false],
    ['N13', 'ok 5pm', 'text', false, false],
    ['N14', 'ok ५', 'text', false, false],
    ['N15', 'thanks but not received', 'text', false, false],
    ['N16', 'Not received', 'text', false, false],
    ['N17', 'yes', 'text', false, false],
    ['N18', 'Yes thanks', 'text', false, false],
    ['N19', 'Haan theek hai', 'text', false, false],
    ['N20', 'No', 'text', false, false],
    ['N21', 'ok cancel it', 'text', false, false],
    ['N22', 'ok stop', 'text', false, false],
    ['N23', 'ok add curd', 'text', false, false],
    ['N24', 'okay when', 'text', false, false],
    ['N25', 'ok where is it', 'text', false, false],
    ['N26', 'is it ok', 'text', false, false],
    ['N27', 'ok pls call', 'text', false, false],
    ['N28', 'Ok refund', 'text', false, false],
    ['N29', 'Paid', 'text', false, false],
    ['N30', 'Payment done', 'text', false, false],
    ['N31', 'Hi', 'text', false, false],
    ['N32', 'Good morning', 'text', false, false],
    ['N33', 'Hmm', 'text', false, false],
    ['N34', 'ok sure', 'text', false, false],
    ['N35', 'Ok I will', 'text', false, false],
    ['N36', 'sir', 'text', false, false],
    ['N37', 'ok \u{1F44E}', 'text', false, false],
    ['N38', '\u{1F621}', 'text', false, false],
    ['N39', '\u{1F914}', 'text', false, false],
    ['N40', '.', 'text', false, false],
    ['N41', 'धन्यवाद', 'text', false, false],
    ['N42', 'ಸರಿ', 'text', false, false],
    ['N43', 'Thank you. But milk was not delivered today', 'text', false, false],
    ['N44', 'ok thanks ok thanks ok thanks ok thanks ok', 'text', false, false],
    ['N45', 'ok ok ok ok ok ok ok ok ok', 'text', false, false],
    ['N46', 'beda', 'text', false, false],
    ['N47', 'ok tomorrow also same', 'text', false, false],
    ['N48', 'ok not ok', 'text', false, false],
    ['N49', 'Voice call initiated', 'voice_call', false, false],
    ['N50', 'ok https://x.co', 'text', false, false],
    ['N51', 'ok update', 'text', false, false],
    ['N52', 'ok for the update', 'text', false, false],
    ['N53', 'thanks for the milk', 'text', false, false],
    ['N54', 'help', 'text', false, false],
    ['N55', 'ok help', 'text', false, false],
];

const LIMIT_VECTORS: Array<[id: string, text: string, expected: boolean]> = [
    ['AX1', 'thankyou thankyou thankyou thankyou okay', true],
    ['AX2', 'thankyou thankyou thankyou thankyou super', false],
    ['AX3', 'ok ok ok ok ok ok ok ok', true],
    ['AX4', 'thanks for your kind support', true],
    ['AX5', 'OK\u{1F44D}', true],
    ['AX6', 'ok\u{1F44D}\u{1F44E}', false],
    ['AX7', 'ok\nthanks', true],
];

describe('isAckOnly', () => {
    describe('positives', () => {
        it.each(POSITIVE_VECTORS)('%s', (_id, text, contentType, hasMedia, expected) => {
            expect(isAckOnly(text, contentType, hasMedia)).toBe(expected);
        });

        it('carries every positive vector of the spec', () => {
            expect(POSITIVE_VECTORS).toHaveLength(52);
        });
    });

    describe('negatives', () => {
        it.each(NEGATIVE_VECTORS)('%s', (_id, text, contentType, hasMedia, expected) => {
            expect(isAckOnly(text, contentType, hasMedia)).toBe(expected);
        });

        it('carries every negative vector of the spec', () => {
            expect(NEGATIVE_VECTORS).toHaveLength(55);
        });
    });

    describe('limits (AX)', () => {
        it.each(LIMIT_VECTORS)('%s', (_id, text, expected) => {
            expect(isAckOnly(text, 'text', false)).toBe(expected);
        });

        it('carries every limit vector', () => {
            expect(LIMIT_VECTORS).toHaveLength(7);
        });

        it('applies one elongation setting to the whole message', () => {
            expect(isAckOnly('soooo goooood', 'text', false)).toBe(false);
        });

        it('defaults hasMedia to false and ignores undefined text', () => {
            expect(isAckOnly('ok', 'text')).toBe(true);
            expect(isAckOnly(undefined, 'text')).toBe(false);
        });
    });
});

describe('ack lists', () => {
    const lists: Array<[name: string, list: readonly (string | number)[], size: number]> = [
        ['ACK_EMOJI', ACK_EMOJI, 29],
        ['ACK_CORE', ACK_CORE, 62],
        ['ACK_FILLER', ACK_FILLER, 34],
        ['ACK_PHRASES', ACK_PHRASES, 23],
        ['ACK_THANKS', ACK_THANKS, 21],
        ['ACK_TAIL_NOUNS', ACK_TAIL_NOUNS, 9],
        ['ACK_NEVER', ACK_NEVER, 49],
    ];

    it.each(lists)('%s has its contract size and no duplicate', (_name, list, size) => {
        expect(list).toHaveLength(size);
        expect(new Set(list).size).toBe(size);
    });

    it('keeps the numeric limits', () => {
        expect(ACK_MAX_LENGTH).toBe(40);
        expect(ACK_MAX_TOKENS).toBe(8);
    });

    it('keeps no ACK_NEVER member in ACK_CORE or ACK_FILLER', () => {
        const allowed = new Set([...ACK_CORE, ...ACK_FILLER]);
        expect(ACK_NEVER.filter((word) => allowed.has(word))).toEqual([]);
    });

    it('keeps every ACK_THANKS member in ACK_CORE', () => {
        const core = new Set(ACK_CORE);
        expect(ACK_THANKS.filter((word) => !core.has(word))).toEqual([]);
    });

    it('keeps no, refund and help out of the free-token lists', () => {
        for (const word of ['no', 'refund', 'help']) {
            expect(ACK_CORE).not.toContain(word);
            expect(ACK_FILLER).not.toContain(word);
        }
    });

    it('builds the tail regex from the tail nouns', () => {
        expect(ACK_TAIL_REGEX.source).toContain(ACK_TAIL_NOUNS.join('|'));
        expect(ACK_TAIL_REGEX.global).toBe(false);
    });
});
