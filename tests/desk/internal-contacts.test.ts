import { describe, it, expect } from 'vitest';
import {
    EMPTY_INTERNAL_MATCHER, buildInternalMatcher, canonicalStaffList, internalPhoneList, sameStaffList,
} from '@/lib/desk/internal-contacts';

const STAFF = ['9876543210'];

describe('buildInternalMatcher', () => {
    it.each(['9876543210', '919876543210', '+91 98765 43210', '09876543210', '0091-9876543210'])(
        'IC1 a staff phone matches in the form %j', (phone) => {
            const matcher = buildInternalMatcher({ staffPhones: STAFF, flags: [] });
            expect(matcher.isInternal(phone)).toBe(true);
            expect(matcher.sourceOf(phone)).toBe('staff_list');
        });

    it.each([
        ['IC2 a phone not on the list', { staffPhones: STAFF, flags: [] }, '919811111111', false, null],
        ['IC3 no list and no flags', { staffPhones: null, flags: [] }, '919876543210', false, null],
        ['IC4 an internal flag without a list', { staffPhones: null, flags: [{ phone: '9811111111', kind: 'internal' as const }] }, '919811111111', true, 'flag'],
        ['IC5 a customer flag beats the list', { staffPhones: STAFF, flags: [{ phone: '9876543210', kind: 'customer' as const }] }, '919876543210', false, null],
        ['IC6 an internal flag on a staff phone reports the flag', { staffPhones: STAFF, flags: [{ phone: '9876543210', kind: 'internal' as const }] }, '9876543210', true, 'flag'],
        ['IC7 a flag stored in another form still matches', { staffPhones: null, flags: [{ phone: '919811111111', kind: 'internal' as const }] }, '9811111111', true, 'flag'],
        ['IC8 both kinds for one phone: customer wins', { staffPhones: null, flags: [{ phone: '9811111111', kind: 'internal' as const }, { phone: '9811111111', kind: 'customer' as const }] }, '9811111111', false, null],
    ])('%s', (_label, input, phone, internal, source) => {
        const matcher = buildInternalMatcher(input);
        expect(matcher.isInternal(phone)).toBe(internal);
        expect(matcher.sourceOf(phone)).toBe(source);
    });

    it.each([null, undefined, '', 'abc', '12345', '0123456789', '98765 4321x'])('IC9 %j is never internal', (phone) => {
        const matcher = buildInternalMatcher({ staffPhones: [...STAFF, '0123456789'], flags: [] });
        expect(matcher.isInternal(phone)).toBe(false);
        expect(matcher.sourceOf(phone)).toBeNull();
    });

    it('IC10 the empty matcher matches nothing', () => {
        expect(EMPTY_INTERNAL_MATCHER.isInternal('919876543210')).toBe(false);
        expect(EMPTY_INTERNAL_MATCHER.sourceOf('919876543210')).toBeNull();
    });
});

describe('lists', () => {
    it('IL1 internalPhoneList: staff plus internal flags minus customer flags, sorted', () => {
        expect(internalPhoneList({
            staffPhones: ['9876543210', '9876500000'],
            flags: [{ phone: '919000000001', kind: 'internal' }, { phone: '9876500000', kind: 'customer' }],
        })).toEqual(['9000000001', '9876543210']);
    });

    it.each([
        [['9876543210', '9876543210', '1234', '0123456789'], ['9876543210']],
        [['9900000012', '9900000011'], ['9900000011', '9900000012']],
        [[], []],
    ])('IL2 canonicalStaffList(%j)', (input, expected) => {
        expect(canonicalStaffList(input)).toEqual(expected);
    });

    it('IL3 sameStaffList ignores order and duplicates', () => {
        expect(sameStaffList(['9900000012', '9900000011', '9900000011'], ['9900000011', '9900000012'])).toBe(true);
        expect(sameStaffList(['9900000011'], ['9900000011', '9900000012'])).toBe(false);
        expect(sameStaffList([], [])).toBe(true);
    });
});
