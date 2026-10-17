'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DeskErrorState } from '@/components/desk/DeskErrorState';
import { DeskNotice } from '@/components/desk/DeskNotice';
import { DeskScrollFrame } from '@/components/desk/DeskFrame';
import { TicketsFilters, toListFilters, type TicketsFilterValues } from '@/components/desk/TicketsFilters';
import { TicketsTable } from '@/components/desk/TicketsTable';
import { useDeskMe } from '@/components/desk/desk-me-context';
import { addIstDays, istToday } from '@/lib/desk/business-hours';
import { validateRange } from '@/lib/desk/ticket-format';
import { useDeskCategories, useTicketList } from '@/lib/desk/ticket-hooks';
import { deskErrorText } from '@/lib/desk/ticket-labels';
import type { TicketListItem } from '@/lib/desk/types';

const RANGE_TEXT = {
    invalid: 'Enter both dates.',
    to_before_from: 'The To date is before the From date.',
    too_large: deskErrorText('range_too_large', ''),
} as const;

function ManagerTicketsPage() {
    const me = useDeskMe();
    const params = useSearchParams();
    const categories = useDeskCategories();
    const [applied, setApplied] = useState<TicketsFilterValues>(() => {
        const today = istToday(new Date());
        return {
            from: params.get('from') ?? addIstDays(today, -6),
            to: params.get('to') ?? today,
            status: '', queue: '', type: '', category_slug: '', assignedToMe: false,
            q: (params.get('q') ?? '').slice(0, 60),
        };
    });
    const [initialValues] = useState(applied);
    const range = validateRange(applied.from, applied.to);
    const filters = toListFilters(applied, me.user.id);
    const list = useTicketList(filters, range === 'ok');

    const pages = list.data?.pages;
    const rows = useMemo<TicketListItem[]>(() => (pages ?? []).flatMap((page) => page.items), [pages]);

    return (
        <DeskScrollFrame>
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Tickets</h1>
                    <p className="text-slate-400">Every ticket, newest first</p>
                </div>
                <Link href="/desk" className="text-sm text-purple-300 hover:underline">← Desk</Link>
            </div>
            <TicketsFilters initial={initialValues} categories={categories.items} onApply={setApplied} />
            {range !== 'ok' ? <p className="text-sm text-amber-300">{RANGE_TEXT[range]}</p> : null}
            {list.isError ? <DeskErrorState error={list.error} onRetry={() => { void list.refetch(); }} /> : null}
            <TicketsTable
                rows={rows}
                bySlug={categories.bySlug}
                loading={range === 'ok' && list.isPending}
                hasNextPage={list.hasNextPage}
                isFetchingNextPage={list.isFetchingNextPage}
                onLoadMore={() => { void list.fetchNextPage(); }}
                exportFilters={me.manager ? filters : null}
            />
        </DeskScrollFrame>
    );
}

/** Body of /desk/tickets. The server allows ticket lists to managers only, so others get a notice and no request. */
export function TicketsPage() {
    const me = useDeskMe();
    if (!me.manager) return <DeskNotice title="This page needs the Desk manager permission." />;
    return <ManagerTicketsPage />;
}
