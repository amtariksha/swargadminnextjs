'use client';

import { useState, type ReactNode } from 'react';
import { CustomerPane } from '@/components/desk/CustomerPane';
import type { ResolveDraft } from '@/lib/desk/resolve-plan';
import type { DeskTab } from '@/lib/desk/ticket-format';
import type { DeskCategories } from '@/lib/desk/ticket-hooks';
import type { TicketDetail, TicketView } from '@/lib/desk/types';

interface TicketWorkspaceLayoutProps {
    detail: TicketDetail;
    tab: DeskTab;
    categories: DeskCategories;
    /** The seen-token state of TicketPanelLoaded (contract §5). */
    seen: string | null;
    onActionConflict: (fresh: TicketView) => void;
    onStartResolve: (draft: ResolveDraft) => void;
    /** The ticket column: header, banners, centre body, dialogs. */
    children: ReactNode;
}

/** Ticket column plus the customer pane: beside it from 1280 px, behind a "Customer" button below that. */
export function TicketWorkspaceLayout({ children, ...paneProps }: TicketWorkspaceLayoutProps) {
    const [paneOpen, setPaneOpen] = useState(false);
    return (
        <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex justify-end border-b border-slate-800/50 px-4 py-1.5 xl:hidden">
                    <button
                        type="button"
                        onClick={() => setPaneOpen(true)}
                        className="rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
                    >
                        Customer
                    </button>
                </div>
                {children}
            </div>
            <div
                className={`${paneOpen ? 'fixed inset-0 z-40 flex bg-slate-950' : 'hidden'} min-h-0 flex-col border-l border-slate-800/50 xl:static xl:z-auto xl:flex xl:w-[360px] xl:flex-shrink-0 xl:bg-transparent`}
            >
                <div className="flex items-center justify-between border-b border-slate-800/50 px-3 py-2 xl:hidden">
                    <span className="text-sm font-semibold text-white">Customer</span>
                    <button
                        type="button"
                        onClick={() => setPaneOpen(false)}
                        className="rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
                    >
                        Close
                    </button>
                </div>
                <CustomerPane {...paneProps} />
            </div>
        </div>
    );
}
