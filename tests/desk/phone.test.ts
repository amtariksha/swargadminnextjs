/**
 * Vectors F01-F27 of the Desk contract (section 7.2): the three phone forms that
 * keep one customer from becoming two (10-digit for app_db writes, 91-prefixed for
 * WhatsApp, both for lookups).
 */

import { describe, it, expect } from 'vitest';
import { phoneVariants, toBackendPhone, toWhatsAppPhone } from '@/lib/desk/phone';

type PhoneInput = string | number | null | undefined;
type PhoneVector = [
    id: string,
    input: PhoneInput,
    backend: string | null,
    whatsapp: string | null,
    variants: string[],
];

const TEN = (national: string): [string, string, string[]] => [national, `91${national}`, [national, `91${national}`]];

const PHONE_VECTORS: PhoneVector[] = [
    ['F01', '9876543210', ...TEN('9876543210')],
    ['F02', '919876543210', ...TEN('9876543210')],
    ['F03', '+919876543210', ...TEN('9876543210')],
    ['F04', '+91 98765 43210', ...TEN('9876543210')],
    ['F05', '98765-43210', ...TEN('9876543210')],
    ['F06', '(+91) 98765-43210', ...TEN('9876543210')],
    ['F07', '09876543210', ...TEN('9876543210')],
    ['F08', '0919876543210', ...TEN('9876543210')],
    ['F09', '00919876543210', ...TEN('9876543210')],
    ['F10', 9876543210, ...TEN('9876543210')],
    ['F11', '9198765432', ...TEN('9198765432')],
    ['F12', '919198765432', ...TEN('9198765432')],
    ['F13', '987654321000_deleted', null, null, []],
    ['F14', '919876543210 00_deleted', null, null, []],
    ['F15', '98765', null, null, []],
    ['F16', '987654321', null, null, []],
    ['F17', '0123456789', null, null, []],
    ['F18', '971501234567', null, null, ['971501234567']],
    ['F19', '14155552671', null, null, ['14155552671']],
    ['F20', '91987654321', null, null, ['91987654321']],
    ['F21', '9876543210123456', null, null, []],
    ['F22', 'default', null, null, []],
    ['F23', '', null, null, []],
    ['F24', null, null, null, []],
    ['F25', '  9876543210  ', ...TEN('9876543210')],
    ['F26', '98765.43210', ...TEN('9876543210')],
    ['F27', '98765x43210', null, null, []],
];

describe('phone helpers', () => {
    describe.each(PHONE_VECTORS)('%s', (_id, input, backend, whatsapp, variants) => {
        it('toBackendPhone', () => {
            expect(toBackendPhone(input)).toBe(backend);
        });
        it('toWhatsAppPhone', () => {
            expect(toWhatsAppPhone(input)).toBe(whatsapp);
        });
        it('phoneVariants', () => {
            expect(phoneVariants(input)).toEqual(variants);
        });
    });

    it('carries every vector of the spec', () => {
        expect(PHONE_VECTORS).toHaveLength(27);
    });

    it('treats undefined like null', () => {
        expect(toBackendPhone(undefined)).toBeNull();
        expect(toWhatsAppPhone(undefined)).toBeNull();
        expect(phoneVariants(undefined)).toEqual([]);
    });
});
