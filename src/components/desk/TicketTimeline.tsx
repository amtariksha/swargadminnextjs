'use client';

import { formatIstDateTime } from '@/lib/desk/ticket-format';
import type { TimelineRow } from '@/lib/desk/ticket-timeline';

interface TicketTimelineProps {
    rows: readonly TimelineRow[];
}

export function TicketTimeline({ rows }: TicketTimelineProps) {
    if (rows.length === 0) return <p className="text-sm text-slate-500">Nothing has happened on this ticket yet.</p>;
    return (
        <ol className="space-y-2">
            {rows.map((row) => (
                <li key={row.key} className="flex gap-3 text-sm">
                    <span className="w-36 flex-shrink-0 text-xs text-slate-500">{formatIstDateTime(row.at)}</span>
                    <div className="min-w-0">
                        <span className={row.kind === 'action' ? 'font-medium text-purple-300' : 'text-slate-200'}>{row.title}</span>
                        {row.detail !== null ? <span className="text-slate-400"> · {row.detail}</span> : null}
                        {row.actor !== null ? <span className="text-slate-500"> · {row.actor}</span> : null}
                    </div>
                </li>
            ))}
        </ol>
    );
}
