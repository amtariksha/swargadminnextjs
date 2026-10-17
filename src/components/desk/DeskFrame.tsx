'use client';

import type { ReactNode } from 'react';
import { useEmbedMode } from '@/lib/desk/browser-hooks';

// Recorded from precondition P-6: desk/layout.tsx adds providers and a banner but no height frame,
// so the page cancels the dashboard padding and sets the height itself. Set this to true only if a
// later layout starts to provide the frame.
const LAYOUT_PROVIDES_FRAME = false;

const HEIGHT_NORMAL = 'h-[calc(100vh-64px-1rem)] lg:h-[calc(100vh-64px-1.5rem)]';
// In embed mode (the delivery-app WebView) there is no Topbar, so the 64px offset does not apply.
const HEIGHT_EMBED = 'h-[calc(100dvh-1rem)] lg:h-[calc(100dvh-1.5rem)]';

interface DeskFrameProps {
    children: ReactNode;
}

/** A full-height frame for the two-column workspace: the queue and the ticket scroll on their own. */
export function DeskWorkspaceFrame({ children }: DeskFrameProps) {
    const embed = useEmbedMode();
    if (LAYOUT_PROVIDES_FRAME) {
        return <div className="flex h-full min-h-0 flex-col">{children}</div>;
    }
    return (
        <div className={`-mx-4 -mb-4 lg:-mx-6 lg:-mb-6 flex flex-col ${embed ? HEIGHT_EMBED : HEIGHT_NORMAL}`}>
            {children}
        </div>
    );
}

/** A normally scrolling page (the ticket list). */
export function DeskScrollFrame({ children }: DeskFrameProps) {
    if (LAYOUT_PROVIDES_FRAME) {
        return <div className="h-full overflow-auto p-4 lg:p-6 space-y-6">{children}</div>;
    }
    return <div className="space-y-6">{children}</div>;
}
