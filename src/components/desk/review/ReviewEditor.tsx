'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { humanise } from '@/components/desk/reports/format';
import { useReviewTicket, type ReviewChange } from '@/hooks/useDeskReports';
import { ROOT_CAUSES, type RootCause } from '@/lib/desk/constants';
import type { ReviewTicketItem } from '@/lib/desk/review-report';

const MAX_ACTION_CHARS = 1000;
const BUTTON = 'rounded-lg px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50';

/** Action items arrive with unit P6b. */
export function CreateActionItemButton() {
    return (
        <button type="button" disabled title="Available after unit P6b" className={`${BUTTON} bg-slate-800 text-slate-400`}>
            Create action item
        </button>
    );
}

const asRootCause = (value: string): RootCause | null => ROOT_CAUSES.find((cause) => cause === value) ?? null;

export function ReviewEditor({ ticket }: { ticket: ReviewTicketItem }) {
    const [rootCause, setRootCause] = useState<RootCause | null>(ticket.root_cause);
    const [action, setAction] = useState(ticket.preventive_action ?? '');
    const mutation = useReviewTicket();
    const reviewed = ticket.reviewed_at !== null;

    const send = async (reviewedAfter: boolean): Promise<void> => {
        const change: ReviewChange = { id: ticket.id, reviewed: reviewedAfter };
        if (rootCause !== ticket.root_cause) change.root_cause = rootCause;
        const trimmed = action.trim() === '' ? null : action.trim();
        if (trimmed !== ticket.preventive_action) change.preventive_action = trimmed;
        const envelope = await mutation.mutateAsync(change);
        if (envelope.ok) toast.success('Saved');
        else toast.error(envelope.error.message);
    };

    return (
        <div className="mt-2 space-y-3 rounded-lg bg-slate-900/60 p-3">
            <label className="block text-xs text-slate-400">
                Root cause
                <select
                    value={rootCause ?? ''}
                    onChange={(event) => setRootCause(asRootCause(event.target.value))}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white"
                >
                    <option value="">Not set</option>
                    {ROOT_CAUSES.map((cause) => <option key={cause} value={cause}>{humanise(cause)}</option>)}
                </select>
            </label>
            <label className="block text-xs text-slate-400">
                Preventive action
                <textarea
                    value={action}
                    maxLength={MAX_ACTION_CHARS}
                    rows={2}
                    onChange={(event) => setAction(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white"
                />
            </label>
            <div className="flex flex-wrap gap-2">
                <button type="button" disabled={mutation.isPending} onClick={() => { void send(reviewed); }} className={`${BUTTON} bg-slate-700 text-white hover:bg-slate-600`}>
                    Save
                </button>
                <button type="button" disabled={mutation.isPending} onClick={() => { void send(true); }} className={`${BUTTON} bg-emerald-600 text-white hover:bg-emerald-500`}>
                    Mark reviewed
                </button>
                {reviewed ? (
                    <button type="button" disabled={mutation.isPending} onClick={() => { void send(false); }} className={`${BUTTON} bg-slate-800 text-slate-200 hover:bg-slate-700`}>
                        Undo
                    </button>
                ) : null}
                <CreateActionItemButton />
            </div>
        </div>
    );
}
