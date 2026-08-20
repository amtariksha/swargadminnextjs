/**
 * Stall POS — till session storage.
 *
 * A stall tablet is unlocked with the shared passcode and holds a `sid` token
 * that is NOT an admin session: the backend rejects it everywhere except the
 * stall routes. So it lives under its OWN localStorage key and never touches
 * localStorage['admin'] — mixing them would make the admin axios interceptor
 * treat a till as a signed-in administrator, and a till expiry would wipe a
 * real admin's session.
 */

const KEY = 'stall_till';
const DEVICE_KEY = 'stall_device_id';

export interface TillSession {
    token: string;
    expiresAt: string | null;
    stall: { id: number; code: string; title: string; self_order_enabled?: boolean };
}

export function readTillSession(): TillSession | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as TillSession;
        return parsed?.token ? parsed : null;
    } catch {
        window.localStorage.removeItem(KEY);
        return null;
    }
}

export function writeTillSession(session: TillSession) {
    window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearTillSession() {
    window.localStorage.removeItem(KEY);
}

/**
 * A stable per-device id, so re-unlocking the same tablet REPLACES its session
 * instead of leaving a trail of live ones for the admin to read through — and
 * so a specific tablet can be revoked by name.
 */
export function deviceId(): string {
    if (typeof window === 'undefined') return '';
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
        id = (window.crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
}
