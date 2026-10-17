'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { DeskMe } from '@/lib/desk/types';

const DeskMeContext = createContext<DeskMe | null>(null);

export function DeskMeProvider({ value, children }: { value: DeskMe; children: ReactNode }) {
    return <DeskMeContext.Provider value={value}>{children}</DeskMeContext.Provider>;
}

/** The server's answer for the current user (GET /api/desk/me). Only valid under desk/layout.tsx. */
export function useDeskMe(): DeskMe {
    const me = useContext(DeskMeContext);
    if (me === null) throw new Error('useDeskMe must be used inside the Desk layout');
    return me;
}
