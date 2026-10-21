'use client';

import { naiveLabel, rupees } from '@/lib/desk/snapshot-format';
import type { SnapshotRecentAction } from '@/lib/desk/types';

export interface ActionBackstopProps {
    items: SnapshotRecentAction[];
    onResolve: (item: SnapshotRecentAction) => void;
}

/** Backend actions taken outside Desk that this ticket does not record (blueprint D6). */
export function ActionBackstop({ items, onResolve }: ActionBackstopProps) {
    if (items.length === 0) return null;
    return (
        <section className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <p className="font-medium">Done outside Desk, not recorded on this ticket</p>
            {items.map((item) => (
                <div key={`${item.ref_type}:${item.ref_id}`} className="space-y-1">
                    <p>{item.summary}</p>
                    <p className="text-xs text-amber-300/80">{naiveLabel(item.at)} · {rupees(item.amount)}</p>
                    <button
                        type="button"
                        onClick={() => onResolve(item)}
                        className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                    >
                        Resolve with this…
                    </button>
                </div>
            ))}
        </section>
    );
}
