// Internal contacts (plan section 8): staff and other non-customers whose conversations open no
// ticket. Two sources: the backend's staff list (sent in the tick body, stored in desk_staff_phones)
// and manual rows of desk_contact_flags. A 'customer' flag beats the staff list. Pure: no I/O, no
// clock; every phone is compared in the 10-digit form of toBackendPhone.

import { toBackendPhone } from './phone';
import type { ContactFlag } from './types';

export interface InternalContactsInput {
    /** 10-digit phones; null = no list (an older backend, or a failed load). */
    staffPhones: readonly string[] | null;
    /** Active rows only (removed_at IS NULL). */
    flags: ReadonlyArray<Pick<ContactFlag, 'phone' | 'kind'>>;
}
export type InternalSource = 'staff_list' | 'flag';
export interface InternalMatcher {
    /** phone in any format; normalised with toBackendPhone. A 'customer' flag beats the staff list. */
    isInternal(phone: string | null | undefined): boolean;
    sourceOf(phone: string | null | undefined): InternalSource | null;
}

/** Valid 10-digit phones, de-duplicated and sorted: the stored form of desk_staff_phones. */
export function canonicalStaffList(phones: readonly string[]): string[] {
    const kept = new Set<string>();
    for (const phone of phones) {
        const ten = toBackendPhone(phone);
        if (ten !== null) kept.add(ten);
    }
    return [...kept].sort();
}

export function sameStaffList(a: readonly string[], b: readonly string[]): boolean {
    const left = canonicalStaffList(a);
    const right = canonicalStaffList(b);
    return left.length === right.length && left.every((phone, index) => phone === right[index]);
}

function flagKinds(flags: InternalContactsInput['flags']): Map<string, ContactFlag['kind']> {
    const kinds = new Map<string, ContactFlag['kind']>();
    for (const flag of flags) {
        const ten = toBackendPhone(flag.phone);
        if (ten === null) continue;
        // Two active rows for one phone cannot exist (unique index); if they did, 'customer' wins.
        if (kinds.get(ten) !== 'customer') kinds.set(ten, flag.kind);
    }
    return kinds;
}

export function buildInternalMatcher(input: InternalContactsInput): InternalMatcher {
    const staff = new Set(canonicalStaffList(input.staffPhones ?? []));
    const kinds = flagKinds(input.flags);
    const sourceOf = (phone: string | null | undefined): InternalSource | null => {
        const ten = toBackendPhone(phone ?? null);
        if (ten === null) return null;
        const kind = kinds.get(ten);
        if (kind === 'customer') return null;
        if (kind === 'internal') return 'flag';
        return staff.has(ten) ? 'staff_list' : null;
    };
    return { sourceOf, isInternal: (phone) => sourceOf(phone) !== null };
}

/** Every 10-digit phone the matcher treats as internal, sorted. */
export function internalPhoneList(input: InternalContactsInput): string[] {
    const matcher = buildInternalMatcher(input);
    const candidates = [...canonicalStaffList(input.staffPhones ?? []), ...input.flags.map((flag) => flag.phone)];
    return canonicalStaffList(candidates.filter((phone) => matcher.isInternal(phone)));
}

export const EMPTY_INTERNAL_MATCHER: InternalMatcher = {
    isInternal: () => false,
    sourceOf: () => null,
};
