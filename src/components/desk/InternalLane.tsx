'use client';

// The Internal lane (unit P1e): conversations of staff and other internal contacts with a message in
// the last INTERNAL_LANE_DAYS days. They open no ticket, so this is where nothing staff send gets lost.
// Read-only: each row opens the old inbox (a Desk thread for a conversation without a ticket is P6b).
// Collapsed, it makes no request. Managers also manage the manual flags here.

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { DeskErrorState } from '@/components/desk/DeskErrorState';
import { useDeskMe } from '@/components/desk/desk-me-context';
import { MarkInternalButton } from '@/components/desk/MarkInternalButton';
import { INTERNAL_LANE_DAYS } from '@/lib/desk/constants';
import { useContactFlags, useInternalConversations, useRemoveContactFlag } from '@/lib/desk/contact-flag-hooks';
import { formatIstDateTime, inboxHref } from '@/lib/desk/ticket-format';
import type { InternalConversationItem } from '@/lib/desk/types';

function LaneRow({ item }: { item: InternalConversationItem }) {
    return (
        <a
            href={inboxHref(item.integrated_number)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/50"
        >
            <span className="min-w-0 flex-1 truncate">
                {item.contact_name ?? 'Unknown'} <span className="text-xs text-slate-500">…{item.phone_tail}</span>
            </span>
            <span className="rounded-md bg-slate-700/50 px-1.5 py-0.5 text-[11px] text-slate-300">
                {item.source === 'staff_list' ? 'Staff' : (item.label ?? 'Marked internal')}
            </span>
            <span className="text-xs text-slate-500">{formatIstDateTime(item.last_inbound_at)}</span>
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
        </a>
    );
}

function FlagList() {
    const flags = useContactFlags(true);
    const remove = useRemoveContactFlag();
    const [adding, setAdding] = useState(false);
    return (
        <div className="space-y-1 border-t border-slate-800/50 px-3 py-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Numbers marked by hand</span>
                <button type="button" onClick={() => setAdding(true)} className="text-xs text-purple-300 underline">Add number</button>
            </div>
            {flags.isError ? <DeskErrorState error={flags.error} onRetry={() => { void flags.refetch(); }} /> : null}
            {(flags.data?.items ?? []).map((flag) => (
                <div key={flag.id} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="flex-1 truncate">{flag.phone} · {flag.label ?? '—'}</span>
                    <span className={flag.kind === 'internal' ? 'text-amber-300' : 'text-emerald-300'}>{flag.kind}</span>
                    <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(flag.id, { onError: () => toast.error('Could not remove the flag') })}
                        className="text-slate-400 underline hover:text-white disabled:opacity-50"
                    >
                        Remove
                    </button>
                </div>
            ))}
            {adding ? <MarkInternalButton onClose={() => setAdding(false)} /> : null}
        </div>
    );
}

export function InternalLane() {
    const me = useDeskMe();
    const [open, setOpen] = useState(false);
    const lane = useInternalConversations(open);
    const items = lane.data?.items ?? [];
    return (
        <div className="border-t border-slate-800/50">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-400 hover:text-white"
            >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Internal{lane.data ? ` (${items.length})` : ''}
            </button>
            {open ? (
                <div>
                    <p className="px-3 pb-2 text-xs text-slate-500">
                        Staff and other internal numbers, last {INTERNAL_LANE_DAYS} days. They open no ticket; reply in the inbox.
                    </p>
                    {lane.isError ? <DeskErrorState error={lane.error} onRetry={() => { void lane.refetch(); }} /> : null}
                    {lane.isPending ? <div className="flex justify-center py-3"><div className="spinner h-6 w-6" /></div> : null}
                    {items.map((item) => <LaneRow key={item.conversation_id} item={item} />)}
                    {lane.data && items.length === 0 ? <p className="px-3 pb-2 text-xs text-slate-500">No internal messages.</p> : null}
                    {me.manager ? <FlagList /> : null}
                </div>
            ) : null}
        </div>
    );
}
