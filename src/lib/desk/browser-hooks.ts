'use client';

import { useCallback, useSyncExternalStore } from 'react';

const subscribeNever = () => () => {};
const readEmbedMode = (): boolean => {
    try {
        return window.localStorage.getItem('embed_mode') === 'wa';
    } catch {
        return false; // storage blocked: normal chrome
    }
};

/** True inside the delivery-app WebView. No setState in an effect. */
export function useEmbedMode(): boolean {
    return useSyncExternalStore(subscribeNever, readEmbedMode, () => false);
}

/** A clock for render: Date.now() in a component body is a lint error. Returns 0 on the server. */
export function useNowMs(stepMs: number): number {
    const subscribe = useCallback((notify: () => void) => {
        const timer = setInterval(notify, stepMs);
        return () => clearInterval(timer);
    }, [stepMs]);
    return useSyncExternalStore(subscribe, () => Math.floor(Date.now() / stepMs) * stepMs, () => 0);
}
