'use client';

import { useDeskHealth } from '@/lib/desk/ticket-hooks';
import { healthSummary } from '@/lib/desk/ticket-format';

const LEVEL_CLASS = {
    ok: 'text-slate-500',
    warn: 'bg-amber-500/20 text-amber-300',
    stale: 'bg-amber-500/20 text-amber-300',
    error: 'bg-red-500/10 border border-red-500/30 text-red-200',
} as const;

/** One line about the ticket engine. The red "engine has not run" banner belongs to the layout. */
export function DeskHealthStrip() {
    const { data, isError, isPending } = useDeskHealth();
    if (isPending && !isError) return null;
    if (data === undefined) {
        return <div className="px-4 py-1.5 text-xs text-slate-500">Health unavailable</div>;
    }
    const summary = healthSummary(data);
    const isChip = summary.level !== 'ok';
    return (
        <div className="px-4 py-1.5">
            <p
                title={summary.text}
                className={`truncate text-xs ${LEVEL_CLASS[summary.level]} ${isChip ? 'rounded-lg px-2 py-1' : ''}`}
            >
                {summary.text}
            </p>
        </div>
    );
}
