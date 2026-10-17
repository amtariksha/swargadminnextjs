// The /desk page guard as a pure function: what the layout renders for a given GET /api/desk/me
// answer. First match wins. Nothing here navigates; a denied caller sees a card in place.

import type { DeskEnvelope, DeskErrorCode } from './contracts';
import type { DeskMe } from './types';

export const DESK_MANAGER_PATHS = ['/desk/dashboard', '/desk/review', '/desk/settings'] as const;
const SETTINGS_PATH = '/desk/settings';

export type DeskGuardView =
    | { view: 'no_access' }
    | { view: 'session_expired' }
    | { view: 'unavailable'; code: DeskErrorCode }
    | { view: 'switched_off' }
    | { view: 'manager_only' }
    | { view: 'workspace'; me: DeskMe };

const isUnder = (pathname: string, base: string): boolean =>
    pathname === base || pathname.startsWith(`${base}/`);

export function decideDeskGuard(envelope: DeskEnvelope<DeskMe>, pathname: string): DeskGuardView {
    if (!envelope.ok) {
        const { code } = envelope.error;
        if (code === 'forbidden') return { view: 'no_access' };
        if (code === 'unauthorized') return { view: 'session_expired' };
        return { view: 'unavailable', code };
    }
    const me = envelope.data;
    if (!me.ui_enabled && !(me.manager && isUnder(pathname, SETTINGS_PATH))) return { view: 'switched_off' };
    if (!me.manager && DESK_MANAGER_PATHS.some((base) => isUnder(pathname, base))) return { view: 'manager_only' };
    return { view: 'workspace', me };
}
