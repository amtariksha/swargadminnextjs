'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/whatsapp/ui/tooltip';
import { DeskMeProvider } from '@/components/desk/desk-me-context';
import { DeskNotice } from '@/components/desk/DeskNotice';
import { deskFetch } from '@/lib/desk/client';
import { decideDeskGuard } from '@/lib/desk/guard';
import type { DeskMe } from '@/lib/desk/types';

const ME_REFRESH_MS = 60_000;
const istFormat = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});

function TickBanner({ lastTickAt }: { lastTickAt: string | null }) {
    const since = lastTickAt === null ? 'ever' : `${istFormat.format(new Date(lastTickAt))} IST`;
    return (
        <div role="alert" className="bg-red-900/80 px-4 py-2 text-sm text-red-100">
            The ticket engine has not run since {since}. New messages may not appear as tickets.
        </div>
    );
}

export default function DeskLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { data, isPending, refetch } = useQuery({
        queryKey: ['desk', 'me'],
        queryFn: () => deskFetch<DeskMe>('/api/desk/me'),
        staleTime: ME_REFRESH_MS,
        refetchInterval: ME_REFRESH_MS,
        retry: false,
    });

    if (isPending || data === undefined) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <div className="spinner h-10 w-10" />
            </div>
        );
    }

    const decision = decideDeskGuard(data, pathname);
    switch (decision.view) {
        case 'no_access':
            return <DeskNotice title="You do not have access to Desk. Ask an admin to add the Desk permission to your role." />;
        case 'session_expired':
            return <DeskNotice title="Your session has expired. Sign in to the admin panel again." />;
        case 'manager_only':
            return <DeskNotice title="This page needs the Desk manager permission." />;
        case 'switched_off':
            return (
                <DeskNotice title="Desk is switched off.">
                    {data.ok && data.data.manager ? (
                        <Link className="text-purple-300 underline" href="/desk/settings">Desk settings</Link>
                    ) : null}
                </DeskNotice>
            );
        case 'unavailable':
            return (
                <DeskNotice title={`Desk is temporarily unavailable (${decision.code}).`}>
                    <button
                        type="button"
                        className="rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-600"
                        onClick={() => { void refetch(); }}
                    >
                        Retry
                    </button>
                </DeskNotice>
            );
        case 'workspace':
            return (
                <TooltipProvider delayDuration={200}>
                    <DeskMeProvider value={decision.me}>
                        {decision.me.tick_stale ? <TickBanner lastTickAt={decision.me.last_tick_at} /> : null}
                        {children}
                    </DeskMeProvider>
                </TooltipProvider>
            );
    }
}
