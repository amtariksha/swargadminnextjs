// withDesk: every /api/desk handler is the return value of this function. The decision and the
// actor come from the backend's whoami answer (whoami.ts), never from headers or a request body.
// Order: token, whoami, level, ui flag, handler. Backend down is 503, never 403 and never allowed.

import { NextResponse, type NextRequest } from 'next/server';
import { DESK_ERRORS, type DeskErrorCode } from './contracts';
import { meetsDeskLevel } from './authz-rules';
import { isDeskApiError } from './api-error';
import { allOffDeskSettings, getDeskSettings } from './settings';
import { resolveWhoami } from './whoami';
import type { DeskLevel } from './constants';
import type { DeskContext, DeskSettings, DeskWhoami } from './types';

export type DeskHandler<P = Record<string, never>> =
    (request: NextRequest, ctx: DeskContext, route: { params: Promise<P> }) => Promise<NextResponse>;

export const DESK_WRAPPED = Symbol.for('desk.withDesk');

export function deskOk<T>(data: T, status = 200): NextResponse {
    return NextResponse.json({ ok: true, data }, { status });
}

export function deskFail(code: DeskErrorCode, message: string, data?: unknown): NextResponse {
    const body = data === undefined
        ? { ok: false, error: { code, message } }
        : { ok: false, error: { code, message }, data };
    return NextResponse.json(body, { status: DESK_ERRORS[code] });
}

const BEARER_PREFIX = 'Bearer ';

function bearerToken(request: NextRequest): string {
    const header = request.headers.get('authorization') ?? '';
    return header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : '';
}

async function readSettings(): Promise<DeskSettings> {
    try {
        return await getDeskSettings();
    } catch (error) {
        // Settings that cannot be read mean "everything off" (fail closed), not a crash.
        console.error('[desk-api] settings unreadable', error instanceof Error ? error.name : 'Error');
        return allOffDeskSettings();
    }
}

function contextOf(whoami: DeskWhoami, token: string, settings: DeskSettings): DeskContext {
    const { agent, manager, money, inbox, via } = whoami;
    return { actor: whoami.user, rights: { agent, manager, money, inbox, via }, token, settings };
}

function failureOf(error: unknown): NextResponse {
    if (isDeskApiError(error)) return deskFail(error.code, error.message, error.data);
    console.error('[desk-api] unhandled error', error instanceof Error ? error.name : 'Error');
    return deskFail('internal_error', 'Something went wrong.');
}

export function withDesk<P = Record<string, never>>(
    level: DeskLevel,
    handler: DeskHandler<P>,
    options?: { alwaysOn?: boolean },
): (request: NextRequest, route: { params: Promise<P> }) => Promise<NextResponse> {
    const alwaysOn = options?.alwaysOn === true;
    const wrapped = async (request: NextRequest, route: { params: Promise<P> }): Promise<NextResponse> => {
        const token = bearerToken(request);
        if (token === '') return deskFail('unauthorized', 'Sign in again.');
        const resolved = await resolveWhoami(token, (whoami) => meetsDeskLevel(whoami, level));
        if (resolved.kind === 'unauthorized') return deskFail('unauthorized', 'Sign in again.');
        if (resolved.kind === 'unavailable') {
            return deskFail('authz_unavailable', 'Could not check your access. Try again in a moment.');
        }
        if (!meetsDeskLevel(resolved.whoami, level)) {
            return deskFail('forbidden', 'You do not have access to Desk.');
        }
        const settings = await readSettings();
        if (!settings.ui_enabled && !alwaysOn) return deskFail('ui_disabled', 'Desk is switched off.');
        try {
            return await handler(request, contextOf(resolved.whoami, token, settings), route);
        } catch (error) {
            return failureOf(error);
        }
    };
    Object.defineProperty(wrapped, DESK_WRAPPED, { value: { level, alwaysOn }, enumerable: false });
    return wrapped;
}
