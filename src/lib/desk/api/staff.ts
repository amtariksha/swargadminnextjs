// Who may be assigned a ticket or own an action item: a backend account that holds at least one
// role other than the customer role. The caller's own token is used for the lookup.

import { DESK_CUSTOMER_ROLE_IDS } from '../authz-rules';
import { DeskApiError } from '../api-error';
import { deskBackendGet } from '../backend';
import type { DeskContext } from '../types';

interface BackendUser { name?: unknown; role?: unknown }

const CHECK_FAILED = 'Could not check that staff account.';

async function fetchUser(ctx: DeskContext, staffId: string): Promise<Response> {
    try {
        return await deskBackendGet(`/get_user/${staffId}`, ctx.token);
    } catch {
        // Network error or the 4-second timeout: not the same thing as "no such user".
        throw new DeskApiError('internal_error', CHECK_FAILED);
    }
}

async function readUser(response: Response): Promise<BackendUser | null> {
    try {
        const body: unknown = await response.json();
        const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : null;
        return typeof data === 'object' && data !== null ? (data as BackendUser) : null;
    } catch {
        // A body that is not JSON is a backend failure.
        throw new DeskApiError('internal_error', CHECK_FAILED);
    }
}

const holdsStaffRole = (roles: unknown): boolean =>
    Array.isArray(roles) && roles.some((role) => {
        const roleId = Number((role as { role_id?: unknown } | null)?.role_id);
        return Number.isFinite(roleId) && !DESK_CUSTOMER_ROLE_IDS.includes(roleId);
    });

export async function resolveStaffName(ctx: DeskContext, staffId: string): Promise<string | null> {
    if (staffId === ctx.actor.id) return ctx.actor.name;
    const response = await fetchUser(ctx, staffId);
    if (response.status === 404) throw new DeskApiError('assignee_invalid', 'That user does not exist.');
    if (response.status !== 200) throw new DeskApiError('internal_error', CHECK_FAILED);
    const user = await readUser(response);
    if (user === null) throw new DeskApiError('internal_error', CHECK_FAILED);
    if (!holdsStaffRole(user.role)) throw new DeskApiError('assignee_invalid', 'That user is not a staff account.');
    return typeof user.name === 'string' ? user.name : null;
}
