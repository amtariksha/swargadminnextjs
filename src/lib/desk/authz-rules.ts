// The Desk access truth table: who may use Desk, from a user's roles and delivery capabilities.
// The backend answers GET /api/support/whoami with its own copy and that answer authorises a
// request; this copy exists so the rule is unit-tested here too. It fails closed and never
// throws. An empty permissions list means full access in this system, so a permissions value
// that cannot be parsed must never be treated as an empty list.

import {
    DELIVERY_CAP_WHATSAPP_INBOX,
    PERMISSION_DESK,
    PERMISSION_DESK_MANAGER,
    PERMISSION_WHATSAPP,
} from './constants';

export interface DeskRoleInput {
    role_id?: number | string | null;   // role.id; preferred over `id`
    id?: number | string | null;
    role_title?: string | null;
    title?: string | null;
    permissions: unknown;               // raw role.permissions: array, JSON string, null, or anything else
    deleted?: number | string | null;   // role.deleted; 1 = soft-deleted
}

export interface DeskAccessInput {
    userId: number | string | null;
    roles: readonly DeskRoleInput[] | null;
    /** Union of users.delivery_permissions and every assigned role's delivery_permissions. */
    caps: readonly string[] | null;
}

export interface DeskAccess {
    agent: boolean;
    manager: boolean;
    money: boolean;
    inbox: boolean;
    via: 'full_access' | 'permission' | 'delivery_capability' | 'none';
}

export const DESK_DRIVER_ROLE_IDS: readonly number[] = [4, 5, 6];
export const DESK_DRIVER_ROLE_TITLE_REGEX = /driver|production supervisor/i;
export const DESK_CUSTOMER_ROLE_IDS: readonly number[] = [3];
export const DESK_DENY_USER_IDS: readonly number[] = [1964, 1965];

const CUSTOMER_ROLE_TITLES: readonly string[] = ['user', 'customer'];
const NO_ACCESS: DeskAccess = { agent: false, manager: false, money: false, inbox: false, via: 'none' };
type ParsedPermissions = { kind: 'full' | 'list' | 'invalid'; list: string[] };

function roleIdOf(role: DeskRoleInput): number {
    return Number(role.role_id ?? role.id);
}

function roleTitleOf(role: DeskRoleInput): string {
    return String(role.role_title ?? role.title ?? '');
}

export function isDeskDriverRole(role: DeskRoleInput): boolean {
    return DESK_DRIVER_ROLE_IDS.includes(roleIdOf(role)) || DESK_DRIVER_ROLE_TITLE_REGEX.test(roleTitleOf(role));
}

export function isDeskCustomerRole(role: DeskRoleInput): boolean {
    return DESK_CUSTOMER_ROLE_IDS.includes(roleIdOf(role))
        || CUSTOMER_ROLE_TITLES.includes(roleTitleOf(role).trim().toLowerCase());
}

function fromArray(values: readonly unknown[]): ParsedPermissions {
    if (values.length === 0) return { kind: 'full', list: [] };
    if (values.every((value): value is string => typeof value === 'string')) {
        return { kind: 'list', list: [...(values as readonly string[])] };
    }
    return { kind: 'invalid', list: [] };
}

function fromString(raw: string): ParsedPermissions {
    const text = raw.trim();
    if (text.length === 0) return { kind: 'full', list: [] };
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        // A malformed value grants nothing; it must not read as an empty list (full access).
        return { kind: 'invalid', list: [] };
    }
    return Array.isArray(parsed) ? fromArray(parsed) : { kind: 'invalid', list: [] };
}

export function parseDeskPermissions(raw: unknown): ParsedPermissions {
    if (raw === null || raw === undefined) return { kind: 'full', list: [] };
    if (Array.isArray(raw)) return fromArray(raw);
    if (typeof raw === 'string') return fromString(raw);
    return { kind: 'invalid', list: [] };
}

/** A role entry is usable only when it is a plain object with a positive integer id and its own permissions key. */
function isReadableRole(entry: unknown): entry is DeskRoleInput {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    const id = roleIdOf(entry as DeskRoleInput);
    return Number.isSafeInteger(id) && id > 0 && Object.prototype.hasOwnProperty.call(entry, 'permissions');
}

function isBackOfficeRole(entry: unknown): entry is DeskRoleInput {
    return isReadableRole(entry)
        && Number(entry.deleted) !== 1
        && !isDeskDriverRole(entry)
        && !isDeskCustomerRole(entry);
}

interface RoleGrants {
    full: boolean;
    keys: ReadonlySet<string>;
}

function grantsOf(roles: readonly unknown[]): RoleGrants {
    const keys = new Set<string>();
    let full = false;
    for (const role of roles.filter(isBackOfficeRole)) {
        const parsed = parseDeskPermissions(role.permissions);
        if (parsed.kind === 'full') full = true;
        if (parsed.kind === 'list') parsed.list.forEach((key) => keys.add(key));
    }
    return { full, keys };
}

function combine(grants: RoleGrants, capInbox: boolean): DeskAccess {
    const roleManager = grants.full || grants.keys.has(PERMISSION_DESK_MANAGER);
    const roleAgent = roleManager || grants.keys.has(PERMISSION_DESK);
    if (roleAgent) {
        return { agent: true, manager: roleManager, money: true, inbox: true, via: grants.full ? 'full_access' : 'permission' };
    }
    if (capInbox) return { agent: true, manager: false, money: false, inbox: true, via: 'delivery_capability' };
    return { ...NO_ACCESS, inbox: grants.keys.has(PERMISSION_WHATSAPP) };
}

function computeAccess(input: DeskAccessInput): DeskAccess {
    const denied = DESK_DENY_USER_IDS.includes(Number(input.userId));
    const roles: readonly unknown[] = Array.isArray(input.roles) && !denied ? input.roles : [];
    const caps: readonly unknown[] = Array.isArray(input.caps) ? input.caps : [];
    return combine(grantsOf(roles), caps.includes(DELIVERY_CAP_WHATSAPP_INBOX));
}

export function hasDeskAccess(input: DeskAccessInput): DeskAccess {
    try {
        return computeAccess(input);
    } catch {
        // Fail closed: input that cannot be read grants nothing.
        return { ...NO_ACCESS };
    }
}

export function meetsDeskLevel(access: DeskAccess, level: 'agent' | 'manager'): boolean {
    return level === 'manager' ? access.manager : access.agent;
}
