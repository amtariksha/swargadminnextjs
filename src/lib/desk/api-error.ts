// Errors thrown inside a Desk handler and the two helpers every handler uses to turn a database
// error or a bad request into one. withDesk (authz.ts) answers a DeskApiError with its code.

import type { z } from 'zod';
import { DESK_ERRORS, type DeskErrorCode } from './contracts';
import { classifyDeskDbError, reportNotInstalled, type DeskDbOutcome } from './repo';

export class DeskApiError extends Error {
    readonly code: DeskErrorCode;
    readonly data?: unknown;

    constructor(code: DeskErrorCode, message: string, data?: unknown) {
        super(message);
        this.name = 'DeskApiError';
        this.code = code;
        this.data = data;
    }
}

export function isDeskApiError(value: unknown): value is DeskApiError {
    return value instanceof DeskApiError && value.code in DESK_ERRORS;
}

interface DbErrorLike { code?: string | null; name?: string | null; message?: string | null }

/** ok and conflict are returned to the caller; every other outcome throws. */
export function dbGuard(error: DbErrorLike | null | undefined, table: string): DeskDbOutcome {
    const outcome = classifyDeskDbError(error);
    if (outcome === 'not_installed') {
        reportNotInstalled(table, error?.code ?? '');
        throw new DeskApiError('not_installed', 'Desk is not installed.');
    }
    if (outcome === 'error' || outcome === 'timeout') {
        console.error('[desk-api] database error', table, error?.code ?? '', outcome);
        throw new DeskApiError('internal_error', 'Database error.');
    }
    return outcome;
}

/** Maps the outcome of a DeskRepo method (which never rejects) to the same errors dbGuard throws. */
export function repoGuard<T>(
    result: { outcome: DeskDbOutcome; data: T | null },
    table: string,
): { outcome: 'ok' | 'conflict'; data: T | null } {
    if (result.outcome === 'ok' || result.outcome === 'conflict') {
        return { outcome: result.outcome, data: result.data };
    }
    if (result.outcome === 'not_installed') {
        reportNotInstalled(table, 'repo');
        throw new DeskApiError('not_installed', 'Desk is not installed.');
    }
    throw new DeskApiError('internal_error', 'Database error.');
}

export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    const path = issue?.path.map(String).join('.') ?? '';
    throw new DeskApiError('validation_failed', `${path || 'request'}: ${issue?.message ?? 'invalid'}`);
}

export async function readJsonBody(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        throw new DeskApiError('validation_failed', 'body: must be valid JSON');
    }
}

export function queryObject(request: Request): Record<string, string> {
    return Object.fromEntries(new URL(request.url).searchParams);
}
