'use client';

import { useEffect } from 'react';

/**
 * Client-only effect that registers the PWA service worker (`/sw.js`).
 *
 * Why a separate component? Next.js's root `layout.tsx` is a server
 * component; navigator.serviceWorker is browser-only. Wrapping the
 * registration in a tiny client component keeps the layout server-rendered
 * while still mounting the SW registration on hydration.
 *
 * Uses a forced-update pattern: every visit triggers `registration.update()`,
 * and an active controller is told to `skipWaiting` immediately. Combined
 * with the SW's `clients.claim()` on activate, this means a fresh deploy
 * propagates to the user on the very next page load — no "stuck on old
 * shell" period.
 */
export default function PWARegister() {
    useEffect(() => {
        if (typeof navigator === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;
        if (process.env.NODE_ENV !== 'production') return; // dev = no SW (avoids stale-asset weirdness)

        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then((reg) => {
                // Force a check for a new SW on every page load. If one is
                // waiting, install it and reload so the freshly-deployed
                // code takes effect right away.
                reg.update().catch(() => {});
                if (reg.waiting) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                reg.addEventListener('updatefound', () => {
                    const installing = reg.installing;
                    if (!installing) return;
                    installing.addEventListener('statechange', () => {
                        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                            // A new SW has finished installing while an old one
                            // is still controlling the page. Reload to swap in
                            // the new one (skipWaiting + claim do the rest).
                            window.location.reload();
                        }
                    });
                });
            })
            .catch((err) => {
                // Non-fatal — app still works without the SW, just no
                // "Add to Home Screen" prompt.
                console.warn('[pwa] service worker registration failed:', err);
            });
    }, []);

    return null;
}
