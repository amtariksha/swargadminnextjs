'use client';

/**
 * The passcode pad.
 *
 * Shown instead of the admin login whenever a till has no session — including
 * when one expires mid-shift. That distinction is the whole point: the admin
 * screen asks for an email and a password, which nobody standing at a market
 * stall has.
 *
 * The stall code comes from ?stall= (the QR encodes it) and is then remembered,
 * so a tablet that has been used once only ever needs the passcode.
 */

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Store, Delete, ArrowRight } from 'lucide-react';
import { stallPost, StallApiError } from '@/lib/stall/api';
import { writeTillSession, deviceId, type TillSession } from '@/lib/stall/session';

const CODE_KEY = 'stall_last_code';
/** Crockford base32 minus I/L/O/U — the alphabet the backend generates from. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export default function StallUnlock({ onUnlocked }: { onUnlocked: (s: TillSession) => void }) {
    const params = useSearchParams();
    const [code, setCode] = useState('');
    const [passcode, setPasscode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [remaining, setRemaining] = useState<number | null>(null);

    useEffect(() => {
        const fromUrl = params.get('stall');
        const remembered = typeof window !== 'undefined'
            ? window.localStorage.getItem(CODE_KEY) : null;
        setCode((fromUrl || remembered || '').toLowerCase());
    }, [params]);

    const submit = useCallback(async () => {
        if (busy || !code.trim() || passcode.length < 4) return;
        setBusy(true);
        setError(null);
        try {
            const session = await stallPost<TillSession>(
                `/stall/${encodeURIComponent(code.trim().toLowerCase())}/unlock`,
                { passcode, device_id: deviceId(), device_label: navigator.userAgent.slice(0, 120) },
            );
            window.localStorage.setItem(CODE_KEY, code.trim().toLowerCase());
            writeTillSession(session);
            setPasscode('');
            onUnlocked(session);
        } catch (err) {
            const e = err as StallApiError;
            setError(e.message || 'That passcode did not work');
            // The backend reports how many tries are left; showing it stops the
            // operator burning the lockout on a typo they could have retyped.
            const left = e.payload?.attempts_remaining;
            setRemaining(typeof left === 'number' ? left : null);
            setPasscode('');
        } finally {
            setBusy(false);
        }
    }, [busy, code, passcode, onUnlocked]);

    const press = (k: string) => setPasscode((p) => (p.length >= 12 ? p : p + k));

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-5 py-8">
            <div className="w-full max-w-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                        <Store className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold leading-tight">Stall till</h1>
                        <p className="text-sm text-slate-400">Enter the stall passcode</p>
                    </div>
                </div>

                <label className="block text-xs text-slate-400 mb-1.5">Stall code</label>
                <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="e.g. kr"
                    className="w-full mb-4 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />

                <label className="block text-xs text-slate-400 mb-1.5">Passcode</label>
                <input
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
                    // A hardware keyboard must still work — a stall may run on a
                    // laptop — so this is a real input, not just a keypad readout.
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                    placeholder="••••••"
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-2xl tracking-[0.4em] text-center placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />

                {error && (
                    <p className="mt-3 text-sm text-red-300">
                        {error}
                        {remaining != null && remaining > 0 && (
                            <span className="text-slate-400"> · {remaining} tries left</span>
                        )}
                    </p>
                )}

                {/* An on-screen pad for the numeric half: on a tablet the system
                    keyboard covers the field and shifts the layout. */}
                <div className="grid grid-cols-3 gap-2 mt-5">
                    {KEYS.slice(0, 9).map((k) => (
                        <button key={k} type="button" onClick={() => press(k)}
                            className="py-4 rounded-xl bg-slate-900 border border-slate-800 text-xl font-medium active:bg-slate-800">
                            {k}
                        </button>
                    ))}
                    <button type="button" onClick={() => setPasscode((p) => p.slice(0, -1))}
                        className="py-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center active:bg-slate-800">
                        <Delete className="w-5 h-5 text-slate-400" />
                    </button>
                    <button type="button" onClick={() => press('0')}
                        className="py-4 rounded-xl bg-slate-900 border border-slate-800 text-xl font-medium active:bg-slate-800">
                        0
                    </button>
                    <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={busy || !code.trim() || passcode.length < 4}
                        className="py-4 rounded-xl bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 flex items-center justify-center active:bg-emerald-700"
                    >
                        {busy ? <span className="w-5 h-5 spinner" /> : <ArrowRight className="w-5 h-5" />}
                    </button>
                </div>

                <p className="mt-5 text-xs text-slate-500 text-center">
                    Letters can be typed on the keyboard. Case and dashes don&apos;t matter.
                </p>
            </div>
        </div>
    );
}
