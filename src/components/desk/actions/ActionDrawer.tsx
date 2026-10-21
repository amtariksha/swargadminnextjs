'use client';

// Shared chrome of every Desk action drawer (P4a, P4b, P4c). Portalled to <body>: the pane sits inside
// `.glass` cards (backdrop-filter makes them a containing block for position:fixed) and must stay out
// of `.whatsapp-shell`. No glass, transform or backdrop-filter on the drawer itself, so a Modal opened
// inside it (RefundModal) still covers the whole screen.

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ActionDrawerProps {
    title: string;
    open: boolean;
    onClose: () => void;
    /** false between "day order saved" and its payment step (contract §2.3): no close button, Escape or backdrop. */
    closable: boolean;
    children: ReactNode;
}

const subscribeNever = () => () => {};

export function ActionDrawer({ title, open, onClose, closable, children }: ActionDrawerProps) {
    const isClient = useSyncExternalStore(subscribeNever, () => true, () => false);

    useEffect(() => {
        if (!open || !closable) return undefined;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, closable, onClose]);

    if (!open || !isClient) return null;
    return createPortal(
        <div className="fixed inset-0 z-[60] flex justify-end">
            <div
                className="absolute inset-0 bg-black/60"
                aria-hidden="true"
                onClick={closable ? onClose : undefined}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="relative flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-slate-950"
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                    <h2 className="min-w-0 truncate text-base font-semibold text-white">{title}</h2>
                    {closable ? (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    ) : (
                        <span className="text-xs text-amber-300">Finish this step to close</span>
                    )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
