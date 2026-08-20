/**
 * Stall POS — its own HTTP client.
 *
 * Deliberately NOT the shared `@/lib/api` axios instance. That one has a 401
 * interceptor which wipes localStorage['admin'] and hard-redirects to /login —
 * correct for the admin panel, catastrophic for a stall tablet, which would
 * land on an email-and-password screen at 6 AM on a market day with no way back
 * to the passcode pad.
 *
 * Auth here is either the till's `sid` token (passcode session) or, when an
 * administrator opens /pos from the panel, their normal admin token. Both are
 * plain bearer tokens; only the failure handling differs.
 */
import axios, { AxiosError } from 'axios';
import { getApiUrl } from '@/config/tenant';
import { readTillSession, clearTillSession } from './session';

export class StallApiError extends Error {
    code: string;
    status: number;
    fieldErrors: Record<string, string[]>;
    /** True when the till session is gone and the operator must re-enter the passcode. */
    needsUnlock: boolean;
    /**
     * The failure's `data` payload, kept rather than discarded — the
     * wrong-passcode reply carries `attempts_remaining`, and showing it is what
     * stops an operator burning the lockout on a typo they could have retyped.
     */
    payload: Record<string, unknown>;

    constructor(message: string, opts: {
        code?: string; status?: number; fieldErrors?: Record<string, string[]>;
        needsUnlock?: boolean; payload?: Record<string, unknown>;
    } = {}) {
        super(message);
        this.name = 'StallApiError';
        this.code = opts.code ?? 'unknown';
        this.status = opts.status ?? 0;
        this.fieldErrors = opts.fieldErrors ?? {};
        this.needsUnlock = opts.needsUnlock ?? false;
        this.payload = opts.payload ?? {};
    }
}

const client = axios.create({ baseURL: getApiUrl(), timeout: 20000 });

/** Admin token, read the same way @/lib/api does — for the panel-user path. */
function adminToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem('admin');
        return raw ? (JSON.parse(raw)?.token ?? null) : null;
    } catch {
        return null;
    }
}

client.interceptors.request.use((config) => {
    // A till session wins when present: on a stall tablet it is the only
    // credential, and if BOTH exist (an admin testing on their own laptop) the
    // till token is the one scoped to the stall being operated.
    const till = readTillSession();
    const token = till?.token ?? adminToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

type Envelope = {
    response?: number;
    status?: boolean;
    message?: string;
    code?: string;
    errors?: Record<string, string[]>;
    data?: unknown;
};

/** Session-ending codes: the passcode pad, not a redirect. */
const UNLOCK_CODES = new Set([
    'stall_session_invalid',
    'stall_session_out_of_scope',
    'stall_scope_mismatch',
    'token_expired',
    'token_invalid',
]);

function toStallError(err: unknown): StallApiError {
    const ax = err as AxiosError<Envelope>;
    const body = ax?.response?.data;
    const status = ax?.response?.status ?? 0;
    const code = body?.code ?? (status === 0 ? 'network' : 'http_error');
    const needsUnlock = UNLOCK_CODES.has(code) || (status === 401 && Boolean(readTillSession()));
    if (needsUnlock) clearTillSession();
    return new StallApiError(
        body?.message
        || (status === 0 ? 'No connection — check the network and try again' : 'Something went wrong'),
        {
            code, status, fieldErrors: body?.errors ?? {}, needsUnlock,
            payload: (body?.data as Record<string, unknown>) ?? {},
        },
    );
}

/**
 * The backend also signals failure IN BAND: HTTP 200 with `status: false` and a
 * non-200 `response` (the wrong-passcode reply is deliberately shaped that way,
 * precisely so it is not a 401). Treat that as an error too.
 */
function unwrap<T>(body: Envelope): T {
    const inBand = body?.response;
    if (body?.status === false || (inBand != null && inBand !== 200 && inBand < 300)) {
        const code = body?.code ?? 'business_error';
        if (UNLOCK_CODES.has(code)) clearTillSession();
        throw new StallApiError(body?.message || 'Something went wrong', {
            code, status: inBand ?? 200, fieldErrors: body?.errors ?? {},
            needsUnlock: UNLOCK_CODES.has(code),
            payload: (body?.data as Record<string, unknown>) ?? {},
        });
    }
    return body?.data as T;
}

export async function stallGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    try {
        const res = await client.get<Envelope>(path, { params });
        return unwrap<T>(res.data);
    } catch (err) {
        if (err instanceof StallApiError) throw err;
        throw toStallError(err);
    }
}

export async function stallPost<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    try {
        const res = await client.post<Envelope>(path, body ?? {});
        return unwrap<T>(res.data);
    } catch (err) {
        if (err instanceof StallApiError) throw err;
        throw toStallError(err);
    }
}
