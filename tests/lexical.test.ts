import { describe, it, expect } from 'vitest';
import { plainTextToLexical, lexicalToPlainText } from '@/lib/lexical';

describe('plainTextToLexical', () => {
    it('returns null for blank input', () => {
        expect(plainTextToLexical('')).toBeNull();
        expect(plainTextToLexical('   ')).toBeNull();
        expect(plainTextToLexical(null)).toBeNull();
        expect(plainTextToLexical(undefined)).toBeNull();
    });

    it('makes one paragraph per line with a Payload-shaped root', () => {
        const doc = plainTextToLexical('line one\nline two');
        expect(doc?.root.type).toBe('root');
        expect(doc?.root.children).toHaveLength(2);
        expect(doc?.root.children[0].type).toBe('paragraph');
    });
});

describe('lexicalToPlainText', () => {
    it('round-trips with plainTextToLexical', () => {
        const text = 'A2 desi cow milk\nFresh daily delivery';
        expect(lexicalToPlainText(plainTextToLexical(text))).toBe(text);
    });

    it('returns "" for null / empty', () => {
        expect(lexicalToPlainText(null)).toBe('');
        expect(lexicalToPlainText(undefined)).toBe('');
        expect(lexicalToPlainText('')).toBe('');
    });

    it('passes through a plain (non-JSON) string unchanged', () => {
        expect(lexicalToPlainText('just text')).toBe('just text');
    });

    it('parses a JSON string form of a Lexical doc', () => {
        const json = JSON.stringify(plainTextToLexical('hello'));
        expect(lexicalToPlainText(json)).toBe('hello');
    });

    it('never throws on malformed JSON', () => {
        expect(() => lexicalToPlainText('{ not valid json')).not.toThrow();
        expect(lexicalToPlainText('{ not valid json')).toBe('{ not valid json');
    });

    it('returns "" for a non-doc object', () => {
        expect(lexicalToPlainText({ foo: 'bar' })).toBe('');
    });
});
