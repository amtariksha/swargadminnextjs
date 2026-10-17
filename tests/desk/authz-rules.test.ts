/**
 * hasDeskAccess truth table H01-H47, plus the PP (parseDeskPermissions), RL (role predicates
 * and meetsDeskLevel) and FC (fails closed) vectors. The backend keeps a twin of this rule
 * (deskAuth.js) that must pass the same table; the backend's answer is the one that authorises.
 */

import { describe, it, expect } from 'vitest';
import {
    hasDeskAccess,
    isDeskCustomerRole,
    isDeskDriverRole,
    meetsDeskLevel,
    parseDeskPermissions,
    type DeskAccess,
    type DeskAccessInput,
    type DeskRoleInput,
} from '@/lib/desk/authz-rules';

type Via = DeskAccess['via'];

const access = (agent: boolean, manager: boolean, money: boolean, inbox: boolean, via: Via): DeskAccess => ({
    agent, manager, money, inbox, via,
});

const NONE = access(false, false, false, false, 'none');
const FULL = access(true, true, true, true, 'full_access');
const AGENT = access(true, false, true, true, 'permission');
const MANAGER = access(true, true, true, true, 'permission');
const CAP_ONLY = access(true, false, false, true, 'delivery_capability');
const INBOX_ONLY = access(false, false, false, true, 'none');

const role = (
    roleId: number | string, title: string, permissions: unknown, extra: Partial<DeskRoleInput> = {},
): DeskRoleInput => ({ role_id: roleId, role_title: title, permissions, ...extra });

const CAP = 'whatsapp-inbox';
const RAW_ENTRY = { id: '21', role_id: '21', role_title: 'Customer Care', delivery_permissions: [] };

type AccessVector = [id: string, input: DeskAccessInput, expected: DeskAccess];

const ACCESS_VECTORS: AccessVector[] = [
    ['H01', { userId: 501, roles: [], caps: [] }, NONE],
    ['H02', { userId: 502, roles: [role(3, 'USER', '[]')], caps: [] }, NONE],
    ['H03', { userId: 503, roles: [role('3', 'USER', null)], caps: [] }, NONE],
    ['H04', { userId: 601, roles: [role(4, 'DRIVER', '[]')], caps: [] }, NONE],
    ['H05', { userId: 602, roles: [role(12, 'Day Driver', [])], caps: [] }, NONE],
    ['H06', { userId: 603, roles: [role(15, 'Production Supervisor', [])], caps: ['delivery-list'] }, NONE],
    ['H07', { userId: 604, roles: [role(6, 'Day Driver', [])], caps: [CAP] }, CAP_ONLY],
    ['H08', { userId: 605, roles: [], caps: [CAP] }, CAP_ONLY],
    ['H09', { userId: 701, roles: [role(4, 'DRIVER', []), role(21, 'Customer Care', ['desk'])], caps: [] }, AGENT],
    ['H10', { userId: 702, roles: [role(5, 'Truck Driver', []), role(2, 'Admin', [])], caps: [] }, FULL],
    ['H11', { userId: 703, roles: [role(21, 'Customer Care', [])], caps: [] }, FULL],
    ['H12', { userId: 704, roles: [role(2, 'Admin', null)], caps: [] }, FULL],
    ['H13', { userId: 705, roles: [role(1, 'Super Admin', '[]')], caps: [] }, FULL],
    ['H14', { userId: 706, roles: [role(21, 'Customer Care', ['orders', 'desk'])], caps: [] }, AGENT],
    ['H15', { userId: 707, roles: [role(21, 'Customer Care', '["orders","desk"]')], caps: [] }, AGENT],
    ['H16', { userId: 708, roles: [role(22, 'Care Lead', ['desk-manager'])], caps: [] }, MANAGER],
    ['H17', { userId: 709, roles: [role(22, 'Care Lead', ['desk', 'desk-manager'])], caps: [] }, MANAGER],
    ['H18', { userId: 710, roles: [role(23, 'Marketing', ['whatsapp', 'broadcast'])], caps: [] }, INBOX_ONLY],
    ['H19', { userId: 711, roles: [role(24, 'Accounts', ['orders', 'refunds'])], caps: [] }, NONE],
    ['H20', { userId: 712, roles: [role(25, 'Ops', '{not json')], caps: [] }, NONE],
    ['H21', { userId: 713, roles: [role(25, 'Ops', '{"desk":true}')], caps: [] }, NONE],
    ['H22', { userId: 714, roles: [role(25, 'Ops', '{not json'), role(21, 'Customer Care', ['desk'])], caps: [] }, AGENT],
    ['H23', { userId: 1964, roles: [role(26, 'Packing', [])], caps: [] }, NONE],
    ['H24', { userId: 1965, roles: [role(26, 'Packing', [])], caps: [CAP] }, CAP_ONLY],
    ['H25', { userId: '1964', roles: [role(22, 'Care Lead', ['desk-manager'])], caps: [] }, NONE],
    ['H26', { userId: 715, roles: [role(21, 'Customer Care', ['desk'])], caps: [CAP] }, AGENT],
    ['H27', { userId: 716, roles: [role(3, 'Sub Admin', [])], caps: [] }, NONE],
    ['H28', { userId: 717, roles: null, caps: null }, NONE],
    ['H29', { userId: 718, roles: [role(24, 'Accounts', ['orders'])], caps: ['stall-till'] }, NONE],
    ['H30', { userId: 719, roles: [{ id: 21, title: 'Customer Care', permissions: ['desk'] }], caps: [] }, AGENT],
    ['H31', { userId: 720, roles: [role(2, 'Admin', [], { deleted: 1 })], caps: [] }, NONE],
    ['H32', { userId: 721, roles: [role(25, 'Ops', 'null')], caps: [] }, NONE],
    ['H33', { userId: 722, roles: [role(25, 'Ops', ['desk', 7])], caps: [] }, NONE],
    ['H34', { userId: 723, roles: [role(25, 'Ops', ' [ ] ')], caps: [] }, FULL],
    ['H35', { userId: 801, roles: [role(30, 'Customer', [])], caps: [] }, NONE],
    ['H36', { userId: 802, roles: [role(31, ' user ', null)], caps: [] }, NONE],
    ['H37', { userId: 803, roles: [role(32, 'Customer Success', [])], caps: [] }, FULL],
    ['H38', { userId: 804, roles: [role(21, 'Customer Care', ['desk'], { deleted: '1' })], caps: [] }, NONE],
    ['H39', { userId: 805, roles: [role(21, 'Customer Care', ['Desk'])], caps: [] }, NONE],
    ['H40', { userId: 806, roles: [], caps: ['WhatsApp-Inbox'] }, NONE],
    ['H41', { userId: 807, roles: [null, 5, 'x', []] as never, caps: [] }, NONE],
    ['H42', { userId: 808, roles: [{}] as never, caps: [] }, NONE],
    ['H43', { userId: 809, roles: [{ role_title: 'Admin', permissions: [] }], caps: [] }, NONE],
    [
        'H44',
        { userId: 810, roles: [role(0, 'Admin', []), role(-2, 'Admin', []), role('abc', 'Admin', [])], caps: [] },
        NONE,
    ],
    ['H45', { userId: 811, roles: [RAW_ENTRY as never], caps: [] }, NONE],
    ['H46', { userId: 812, roles: [RAW_ENTRY as never], caps: [CAP] }, CAP_ONLY],
];

const UNREADABLE_INPUTS: unknown[] = [undefined, null, 7, 'x', [], { roles: 'x', caps: CAP }];

describe('hasDeskAccess', () => {
    it.each(ACCESS_VECTORS)('%s', (_id, input, expected) => {
        expect(hasDeskAccess(input)).toEqual(expected);
    });

    it('H47 fails closed and never throws on unreadable input', () => {
        for (const value of UNREADABLE_INPUTS) {
            expect(hasDeskAccess(value as never)).toEqual(NONE);
        }
    });

    it('carries every vector of the spec (H47 counts once)', () => {
        expect(ACCESS_VECTORS.length + 1).toBe(47);
    });

    it('does not mutate its input', () => {
        const input = Object.freeze({
            userId: 701,
            roles: Object.freeze([Object.freeze(role(21, 'Customer Care', Object.freeze(['desk'])))]),
            caps: Object.freeze([CAP]),
        });
        expect(hasDeskAccess(input)).toEqual(AGENT);
    });
});

describe('parseDeskPermissions (PP)', () => {
    const full = { kind: 'full', list: [] };
    const invalid = { kind: 'invalid', list: [] };
    const VECTORS: Array<[id: string, raw: unknown, expected: { kind: string; list: string[] }]> = [
        ['PP01', null, full],
        ['PP02', undefined, full],
        ['PP03', [], full],
        ['PP04', '', full],
        ['PP05', '   ', full],
        ['PP06', '[]', full],
        ['PP07', ' [ ] ', full],
        ['PP08', ['desk', 'orders'], { kind: 'list', list: ['desk', 'orders'] }],
        ['PP09', '["desk","orders"]', { kind: 'list', list: ['desk', 'orders'] }],
        ['PP10', ['desk', 7], invalid],
        ['PP11', '[1]', invalid],
        ['PP12', '{not json', invalid],
        ['PP13', 'null', invalid],
        ['PP14', '{"desk":true}', invalid],
        ['PP15', '"desk"', invalid],
        ['PP16', 5, invalid],
        ['PP17', true, invalid],
        ['PP18', { desk: true }, invalid],
    ];

    it.each(VECTORS)('%s', (_id, raw, expected) => {
        expect(parseDeskPermissions(raw)).toEqual(expected);
    });

    it('carries every vector', () => {
        expect(VECTORS).toHaveLength(18);
    });

    it('returns a copy of a permission array', () => {
        const source = ['desk'];
        const parsed = parseDeskPermissions(source);
        expect(parsed.list).not.toBe(source);
    });
});

describe('role predicates and meetsDeskLevel (RL)', () => {
    const roleVectors: Array<[id: string, actual: boolean, expected: boolean]> = [
        ['RL1', isDeskDriverRole({ role_id: 4, role_title: 'DRIVER', permissions: [] }), true],
        ['RL2', isDeskDriverRole({ id: '5', title: 'Truck', permissions: [] }), true],
        ['RL3', isDeskDriverRole({ role_id: 12, role_title: 'Day Driver', permissions: [] }), true],
        ['RL4', isDeskDriverRole({ role_id: 15, role_title: 'production SUPERVISOR', permissions: [] }), true],
        ['RL5', isDeskDriverRole({ role_id: 21, role_title: 'Customer Care', permissions: [] }), false],
        ['RL6', isDeskCustomerRole({ role_id: 3, role_title: 'USER', permissions: [] }), true],
        ['RL7', isDeskCustomerRole({ id: '3', title: 'Sub Admin', permissions: [] }), true],
        ['RL7a', isDeskCustomerRole({ role_id: 30, role_title: 'Customer', permissions: [] }), true],
        ['RL7b', isDeskCustomerRole({ role_id: 31, role_title: ' USER ', permissions: [] }), true],
        ['RL7c', isDeskCustomerRole({ role_id: 21, role_title: 'Customer Care', permissions: [] }), false],
        ['RL8', meetsDeskLevel(access(true, false, true, true, 'permission'), 'agent'), true],
        ['RL9', meetsDeskLevel(access(true, false, true, true, 'permission'), 'manager'), false],
        ['RL10', meetsDeskLevel(access(false, false, false, true, 'none'), 'agent'), false],
        ['RL11', meetsDeskLevel(access(true, true, true, true, 'full_access'), 'manager'), true],
    ];

    it.each(roleVectors)('%s', (_id, actual, expected) => {
        expect(actual).toBe(expected);
    });

    it('carries every vector', () => {
        expect(roleVectors).toHaveLength(14);
    });
});

describe('hasDeskAccess fails closed (FC)', () => {
    it('FC1 returns all false for a null input', () => {
        expect(hasDeskAccess(null as never)).toEqual(NONE);
    });

    it('FC2 skips a role without an id; the capability grants chat-only agent', () => {
        const input = { userId: 1, roles: [null as never, { permissions: ['desk'] }], caps: [CAP, 5 as never] };
        expect(hasDeskAccess(input)).toEqual(CAP_ONLY);
    });

    it('FC3 reads the second role once it has an id', () => {
        const input = { userId: 1, roles: [null as never, { role_id: 21, permissions: ['desk'] }], caps: [CAP, 5 as never] };
        expect(hasDeskAccess(input)).toEqual(AGENT);
    });
});
