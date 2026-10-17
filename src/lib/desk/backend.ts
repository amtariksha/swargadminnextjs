// Server-side calls from a Desk handler to the swarg backend. The URL rule is the one the LMS
// link-existing route already uses; no new environment variable.

const BACKEND_TIMEOUT_MS = 4000;
const FALLBACK_BACKEND_URL = 'https://node.desicowmilk.com';

export function deskBackendUrl(path: string): string {
    const base = (process.env.SWARG_BACKEND_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? FALLBACK_BACKEND_URL)
        .replace(/\/$/, '');
    const tenant = process.env.NEXT_PUBLIC_TENANT_CODE || 'swarg';
    return `${base}/api/${tenant}${path}`;
}

/** Plain JSON GET with the caller's bearer token. Rejects on a network error or after 4 seconds. */
export function deskBackendGet(path: string, token: string): Promise<Response> {
    return fetch(deskBackendUrl(path), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
}
