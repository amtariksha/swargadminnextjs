'use client';

import type { ReactNode } from 'react';
import type { Category, TicketListItem } from '@/lib/desk/types';
import { categoryLabel, formatIstDateTime, formatWaiting } from '@/lib/desk/ticket-format';
import { TICKET_STATUS_LABEL } from '@/lib/desk/ticket-labels';

interface QueueRowProps {
    item: TicketListItem;
    selected: boolean;
    /** Show Care or Sales on the row: only useful where both queues are mixed. */
    showQueue: boolean;
    bySlug: ReadonlyMap<string, Category>;
    onSelect: (ticketNo: number) => void;
}

interface ChipProps {
    children: ReactNode;
    tone?: 'slate' | 'red' | 'amber' | 'blue';
    dashed?: boolean;
}

const TONE_CLASS = {
    slate: 'bg-slate-700/50 text-slate-300',
    red: 'bg-red-500/20 text-red-400',
    amber: 'bg-amber-500/20 text-amber-400',
    blue: 'bg-blue-500/20 text-blue-400',
} as const;

function Chip({ children, tone = 'slate', dashed = false }: ChipProps) {
    return (
        <span
            className={`rounded-md px-1.5 py-0.5 text-[11px] leading-none ${TONE_CLASS[tone]} ${
                dashed ? 'border border-dashed border-slate-500' : ''
            }`}
        >
            {children}
        </span>
    );
}

function categoryChip(item: TicketListItem, bySlug: ReadonlyMap<string, Category>): ReactNode {
    if (item.category_slug !== null) return <Chip>{categoryLabel(item.category_slug, bySlug)}</Chip>;
    if (item.suggested_category !== null) {
        return <Chip dashed>Suggested: {categoryLabel(item.suggested_category, bySlug)}</Chip>;
    }
    return null;
}

function leftBorder(item: TicketListItem): string {
    if (item.overdue) return 'border-l-red-500';
    return item.attention_since !== null ? 'border-l-amber-500' : 'border-l-transparent';
}

/** One ticket in the queue. Rows are rendered exactly as the server ordered them. */
export function QueueRow({ item, selected, showQueue, bySlug, onSelect }: QueueRowProps) {
    return (
        <button
            type="button"
            onClick={() => onSelect(item.ticket_no)}
            className={`block w-full border-b border-l-2 border-b-slate-800/50 px-3 py-2.5 text-left transition-colors hover:bg-slate-800/40 ${
                leftBorder(item)
            } ${selected ? 'bg-purple-600/10' : ''}`}
        >
            <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-white">{item.customer_name ?? item.customer_phone ?? 'Unknown'}</span>
                <span className={`flex-shrink-0 text-xs ${item.overdue ? 'text-red-400' : 'text-slate-400'}`}>
                    {formatWaiting(item.waiting_secs)}
                </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-400">{item.preview ?? ''}</span>
                {item.unread_count > 0 ? (
                    <span className="flex-shrink-0 rounded-full bg-purple-600 px-1.5 text-[11px] text-white">{item.unread_count}</span>
                ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
                <Chip>#{item.ticket_no}</Chip>
                <Chip>{TICKET_STATUS_LABEL[item.status]}</Chip>
                {categoryChip(item, bySlug)}
                {showQueue ? <Chip tone="blue">{item.queue === 'care' ? 'Care' : 'Sales'}</Chip> : null}
                <Chip>{item.assigned_name ?? 'Unassigned'}</Chip>
                {item.overdue ? <Chip tone="red">Overdue</Chip> : null}
                {item.priority === 1 ? <Chip tone="red">Urgent</Chip> : null}
                {item.status === 'on_hold' ? <Chip tone="amber">On hold till {formatIstDateTime(item.follow_up_at)}</Chip> : null}
                {item.reopen_count > 0 ? <Chip tone="amber">Reopened ×{item.reopen_count}</Chip> : null}
                {item.origin === 'missing_message' ? <Chip tone="amber">Message may be missing</Chip> : null}
                {item.escalated_at !== null ? <Chip tone="red">Escalated</Chip> : null}
            </div>
        </button>
    );
}
