'use client';

/**
 * Full-screen, chrome-less layout for the stall till.
 *
 * Modelled on (driver)/layout.tsx, which already serves /production-delivery
 * sidebar-less on a phone — but with a second way in. The driver layout only
 * accepts an admin session; a stall tablet is unlocked by the shared passcode
 * and holds a till token instead, so this one accepts EITHER:
 *
 *   · a till session (localStorage['stall_till']) — the normal stall case;
 *   · an authenticated admin with the 'pos' permission — raising a bill from
 *     the office, and the way a manager checks the till without the passcode.
 *
 * Neither is redirected to /login. A stall tablet that lands on the admin
 * email-and-password screen mid-market is a dead end for the person holding it;
 * the passcode pad is shown instead.
 */

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { readTillSession, clearTillSession, type TillSession } from '@/lib/stall/session';
import StallUnlock from '@/components/stall/StallUnlock';
import { Store, LogOut } from 'lucide-react';

export default function PosLayout({ children }: { children: React.ReactNode }) {
    const { isLoading, isAuthenticated, hasPermission, admin } = useAuth();
    const [till, setTill] = useState<TillSession | null>(null);
    const [ready, setReady] = useState(false);

    // localStorage is not available during SSR, so the till is read after mount.
    useEffect(() => {
        setTill(readTillSession());
        setReady(true);
    }, []);

    // The API client clears the till session on any auth failure; listen so the
    // pad comes back without a reload when a session expires mid-shift.
    useEffect(() => {
        const onStorage = () => setTill(readTillSession());
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const onUnlocked = useCallback((session: TillSession) => setTill(session), []);
    const signOut = useCallback(() => {
        clearTillSession();
        setTill(null);
    }, []);

    if (isLoading || !ready) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <div className="w-12 h-12 spinner" />
            </div>
        );
    }

    const adminMayOperate = isAuthenticated && hasPermission('pos');
    if (!till && !adminMayOperate) {
        return <StallUnlock onUnlocked={onUnlocked} />;
    }

    // A till shows the stall it is bound to. An admin sees the screen's name —
    // which stall they are ringing up for is shown by the page itself, and can
    // be switched there, so putting their email here was just noise.
    const label = till ? till.stall.title : 'Stall Till';

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col">
            {/* Compact header: at a counter every pixel below it is the grid. */}
            <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50">
                <div className="px-3 py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <Store className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        <div className="min-w-0">
                            <h1 className="font-semibold text-sm truncate">{label}</h1>
                            <p className="text-[11px] text-slate-400 truncate">
                                {till ? `Till · ${till.stall.code}` : (admin?.email ?? '')}
                            </p>
                        </div>
                    </div>
                    {till && (
                        <button
                            onClick={signOut}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-slate-300 active:bg-slate-700"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Lock
                        </button>
                    )}
                </div>
            </header>
            <main className="flex-1 min-h-0 flex flex-col">{children}</main>
        </div>
    );
}
