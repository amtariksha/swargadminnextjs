// The one browser-side helper every Desk page uses to call /api/desk. It never throws for an HTTP
// status and never navigates: a 401 or 403 is returned as a failure envelope and shown in place
// (the delivery-app WebView would loop through its sign-in page otherwise). Type-only imports from the rest
// of lib/desk: this file must stay free of server-only modules.

import { wfetch } from '@/lib/whatsapp/wfetch';
import type { DeskEnvelope, DeskErrorCode } from './contracts';

function codeForStatus(status: number): DeskErrorCode {
    if (status === 401) return 'unauthorized';
    if (status === 403) return 'forbidden';
    return 'internal_error';
}

async function readBody(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        // An HTML error page or an empty body: the status alone describes the failure.
        return null;
    }
}

function isEnvelope(body: unknown): boolean {
    return typeof body === 'object' && body !== null && typeof (body as { ok?: unknown }).ok === 'boolean';
}

function messageOf(body: unknown, status: number): string {
    const text = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : null;
    return typeof text === 'string' && text.length > 0 ? text : `HTTP ${status}`;
}

export async function deskFetch<T, C = undefined>(
    path: string,
    init?: RequestInit,
): Promise<DeskEnvelope<T, C>> {
    try {
        const headers = new Headers(init?.headers);
        if (typeof init?.body === 'string' && !headers.has('content-type')) {
            headers.set('content-type', 'application/json');
        }
        const response = await wfetch(path, { ...init, headers });
        const body = await readBody(response);
        if (isEnvelope(body)) return body as DeskEnvelope<T, C>;
        return {
            ok: false,
            error: { code: codeForStatus(response.status), message: messageOf(body, response.status) },
        };
    } catch {
        // A rejected fetch (offline, aborted): reported, not thrown, so a page can render a retry.
        return { ok: false, error: { code: 'internal_error', message: 'Network error' } };
    }
}
