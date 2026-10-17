// Report-only inbox gate (blueprint D9). The legacy /api/whatsapp handlers call reportInboxAccess
// first thing; it asks the same whoami cache Desk uses whether the caller holds the inbox right and
// only LOGS who would be denied. It never awaits, never throws and never changes a response, so
// the old inbox behaves exactly as before. Unit P8 turns the log into enforcement.

import { after } from 'next/server';
import { WHOAMI_CACHE_MS } from './constants';
import { hashToken, resolveWhoami } from './whoami';

export type InboxGateRoute = 'conversations.list' | 'conversations.get' | 'conversations.patch' | 'chat.send';
export type InboxGateOutcome = 'allowed' | 'would_deny' | 'unverified' | 'skipped';

const BEARER_PREFIX = 'Bearer ';
const LOG_KEY_LIMIT = 500;
const loggedAt = new Map<string, number>();

/** One line per key per WHOAMI_CACHE_MS per server instance. */
function logOnce(key: string, line: string): void {
    const nowMs = Date.now();
    const last = loggedAt.get(key);
    if (last !== undefined && nowMs - last < WHOAMI_CACHE_MS) return;
    if (loggedAt.size >= LOG_KEY_LIMIT) loggedAt.clear();
    loggedAt.set(key, nowMs);
    console.warn(line);
}

function tokenOf(authorization: string | null): string {
    return authorization !== null && authorization.startsWith(BEARER_PREFIX)
        ? authorization.slice(BEARER_PREFIX.length)
        : '';
}

function reportDenial(route: InboxGateRoute, reason: string, user: string, via: string): void {
    logOnce(
        `${route}|${reason}|${user}`,
        `[desk-inbox-gate] report_only would_deny route=${route} reason=${reason} user=${user} via=${via}`,
    );
}

async function evaluate(token: string, route: InboxGateRoute): Promise<InboxGateOutcome> {
    const result = await resolveWhoami(token, (whoami) => whoami.inbox);
    if (result.kind === 'unavailable') {
        logOnce(`${route}|unverified`, `[desk-inbox-gate] report_only unverified route=${route} reason=authz_unavailable`);
        return 'unverified';
    }
    if (result.kind === 'unauthorized') {
        reportDenial(route, 'token_rejected', `token:${hashToken(token).slice(0, 8)}`, 'none');
        return 'would_deny';
    }
    if (result.whoami.inbox) return 'allowed';
    reportDenial(route, 'no_inbox_right', result.whoami.user.id, result.whoami.via);
    return 'would_deny';
}

export async function evaluateInboxAccess(
    authorization: string | null,
    route: InboxGateRoute,
): Promise<InboxGateOutcome> {
    const token = tokenOf(authorization);
    if (token === '') return 'skipped';
    try {
        return await evaluate(token, route);
    } catch {
        // Report-only: a failure of the check itself is invisible to the caller.
        return 'unverified';
    }
}

export function reportInboxAccess(request: Request, route: InboxGateRoute): void {
    try {
        const task = evaluateInboxAccess(request.headers.get('authorization'), route).then(() => undefined);
        try {
            after(task);
        } catch {
            // No request scope (unit tests): the task is already running.
        }
    } catch {
        // Report-only: nothing here may affect the legacy inbox.
    }
}

export function resetInboxGateLogForTests(): void {
    loggedAt.clear();
}
