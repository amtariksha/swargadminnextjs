// The whoami cache: asks the backend who a token belongs to and what Desk rights it has, and
// remembers the answer for WHOAMI_CACHE_MS. Keyed by the SHA-256 of the token, bounded, and
// stale-on-error only for a caller that was allowed. Fail closed: an answer that does not parse
// is a failure, never "all false".

import { createHash } from 'node:crypto';
import { WHOAMI_CACHE_MAX_ENTRIES, WHOAMI_CACHE_MS } from './constants';
import { backendEnvelope, whoamiData } from './contracts';
import { deskBackendGet } from './backend';
import type { DeskWhoami } from './types';

export type WhoamiResult =
    | { kind: 'ok'; whoami: DeskWhoami; stale: boolean }
    | { kind: 'unauthorized' }
    | { kind: 'unavailable' };

type FetchOutcome = { kind: 'fresh'; whoami: DeskWhoami } | { kind: 'unauthorized' } | { kind: 'failed' };

interface CacheEntry { whoami: DeskWhoami; fetchedAt: number }

const cache = new Map<string, CacheEntry>();
/**
 * When the backend last FAILED for a token (not 200, not 401). Inside WHOAMI_FAILURE_BACKOFF_MS the
 * backend is not asked again: legacy inbox polls (every 5-10 s) would otherwise spend the user's own
 * backend rate-limit bucket on retries. A remembered failure never means "allowed".
 */
const failedAt = new Map<string, number>();
export const WHOAMI_FAILURE_BACKOFF_MS = 60_000;
const inFlight = new Map<string, Promise<FetchOutcome>>();
const responseSchema = backendEnvelope(whoamiData);

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function remember(key: string, whoami: DeskWhoami, now: number): void {
    cache.delete(key);
    cache.set(key, { whoami, fetchedAt: now });
    while (cache.size > WHOAMI_CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

function rememberFailure(key: string, now: number): void {
    failedAt.set(key, now);
    while (failedAt.size > WHOAMI_CACHE_MAX_ENTRIES) {
        const oldest = failedAt.keys().next().value;
        if (oldest === undefined) break;
        failedAt.delete(oldest);
    }
}

async function askBackend(token: string): Promise<FetchOutcome> {
    try {
        const response = await deskBackendGet('/support/whoami', token);
        if (response.status === 401) return { kind: 'unauthorized' };
        if (response.status !== 200) return { kind: 'failed' };
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.response !== 200) return { kind: 'failed' };
        return { kind: 'fresh', whoami: parsed.data.data as DeskWhoami };
    } catch {
        // Network error, timeout or a body that is not JSON: the caller decides whether a stale entry may serve.
        return { kind: 'failed' };
    }
}

function sharedAsk(key: string, token: string): Promise<FetchOutcome> {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const task = askBackend(token).finally(() => { inFlight.delete(key); });
    inFlight.set(key, task);
    return task;
}

export async function resolveWhoami(
    token: string,
    allows: (whoami: DeskWhoami) => boolean,
): Promise<WhoamiResult> {
    const key = hashToken(token);
    const entry = cache.get(key);
    const nowMs = Date.now();
    if (entry && nowMs - entry.fetchedAt < WHOAMI_CACHE_MS) {
        return { kind: 'ok', whoami: entry.whoami, stale: false };
    }
    const lastFailure = failedAt.get(key);
    const backingOff = lastFailure !== undefined && nowMs - lastFailure < WHOAMI_FAILURE_BACKOFF_MS;
    const outcome: FetchOutcome = backingOff ? { kind: 'failed' } : await sharedAsk(key, token);
    if (!backingOff) {
        if (outcome.kind === 'failed') rememberFailure(key, Date.now());
        else failedAt.delete(key);
    }
    if (outcome.kind === 'unauthorized') {
        cache.delete(key);
        return { kind: 'unauthorized' };
    }
    if (outcome.kind === 'fresh') {
        remember(key, outcome.whoami, Date.now());
        return { kind: 'ok', whoami: outcome.whoami, stale: false };
    }
    const usable = entry !== undefined
        && Date.now() - entry.fetchedAt <= 2 * WHOAMI_CACHE_MS
        && allows(entry.whoami);
    return usable ? { kind: 'ok', whoami: entry.whoami, stale: true } : { kind: 'unavailable' };
}

export function resetWhoamiCacheForTests(): void {
    cache.clear();
    failedAt.clear();
    inFlight.clear();
}

export function whoamiCacheSizeForTests(): number {
    return cache.size;
}
