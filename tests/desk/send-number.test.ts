/**
 * resolveSendNumber vectors SN01-SN16: a chat send goes out from the number the conversation
 * lives on, and falls back to the request body exactly as the routes behave today.
 */

import { describe, it, expect } from 'vitest';
import { resolveSendNumber, type SendNumberInput, type SendNumberResult } from '@/lib/desk/send-number';

const A = '917996196111';   // care
const B = '917090166111';   // sales

const conversation = (number: string, overridden: boolean): SendNumberResult => ({ number, source: 'conversation', overridden });
const body = (number: string): SendNumberResult => ({ number, source: 'body', overridden: false });
const NOTHING: SendNumberResult = { number: null, source: 'none', overridden: false };

const VECTORS: Array<[id: string, input: SendNumberInput, expected: SendNumberResult]> = [
    ['SN01', { conversationNumber: B, bodyNumber: A, activeNumbers: [A, B] }, conversation(B, true)],
    ['SN02', { conversationNumber: B, bodyNumber: B, activeNumbers: [A, B] }, conversation(B, false)],
    ['SN03', { conversationNumber: B, bodyNumber: null, activeNumbers: [A, B] }, conversation(B, false)],
    ['SN04', { conversationNumber: B, bodyNumber: 'default', activeNumbers: [A, B] }, conversation(B, false)],
    ['SN05', { conversationNumber: B, bodyNumber: '+91 70901 66111', activeNumbers: [A, B] }, conversation(B, false)],
    ['SN06', { conversationNumber: '+91 70901 66111', bodyNumber: A, activeNumbers: [A, B] }, conversation(B, true)],
    ['SN07', { conversationNumber: 'default', bodyNumber: A, activeNumbers: [A, B] }, body(A)],
    ['SN08', { conversationNumber: '919999999999', bodyNumber: A, activeNumbers: [A, B] }, body(A)],
    ['SN09', { conversationNumber: '7090166111', bodyNumber: A, activeNumbers: [A, B] }, body(A)],
    ['SN10', { conversationNumber: B, bodyNumber: `  ${A}  `, activeNumbers: [A] }, body(A)],
    ['SN11', { conversationNumber: B, bodyNumber: A, activeNumbers: [] }, body(A)],
    ['SN12', { conversationNumber: B, bodyNumber: A, activeNumbers: null }, body(A)],
    ['SN13', { conversationNumber: null, bodyNumber: A, activeNumbers: [A, B] }, body(A)],
    ['SN14', { conversationNumber: 'default', bodyNumber: 'default', activeNumbers: [A, B] }, body('default')],
    ['SN15', { conversationNumber: null, bodyNumber: null, activeNumbers: [A, B] }, NOTHING],
    ['SN16', { conversationNumber: '', bodyNumber: '   ', activeNumbers: [A, B] }, NOTHING],
];

describe('resolveSendNumber', () => {
    it.each(VECTORS)('%s', (_id, input, expected) => {
        expect(resolveSendNumber(input)).toEqual(expected);
    });

    it('carries every vector of the spec', () => {
        expect(VECTORS).toHaveLength(16);
    });

    it('treats a missing active list like an empty one', () => {
        expect(resolveSendNumber({ conversationNumber: B, bodyNumber: A, activeNumbers: undefined })).toEqual(body(A));
    });
});
