'use client';

import { useEffect } from 'react';

/**
 * Client-only effect that registers the PWA service worker (`/sw.js`).
 *
 * Why a separate component? Next.js's root `layout.tsx` is a server
 * component; navigator.serviceWorker is browser-only. Wrapping the
 * registration in a tiny client component keeps the layout server-rendered
 * while still mounting the SW registration on hydration.
 */
export default function PWARegister() {
    useEffect(() => {
        if (typeof navigator === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;
        if (process.env.NODE_ENV !== 'production') return; // dev = no SW (avoids stale-asset weirdness)

        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .catch((err) => {
                // Non-fatal — app still works without the SW, just no
                // "Add to Home Screen" prompt.
                console.warn('[pwa] service worker registration failed:', err);
            });
    }, []);

    return null;
}
