'use client';

import { useState } from 'react';
import { AssigneePicker } from '@/components/desk/AssigneePicker';
import type { Ticket } from '@/lib/desk/types';

interface AssigneeMenuProps {
    ticket: Pick<Ticket, 'assigned_to' | 'assigned_name'>;
    meId: string;
    /** false in the delivery-app WebView and for chat-only agents: no staff list is loaded for them. */
    canPickOthers: boolean;
    pending: boolean;
    onAssign: (assignedTo: string | null) => void;
}

const LINK = 'text-xs text-purple-300 hover:underline disabled:opacity-50';

export function AssigneeMenu({ ticket, meId, canPickOthers, pending, onAssign }: AssigneeMenuProps) {
    const [picking, setPicking] = useState(false);
    return (
        <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-300">{ticket.assigned_name ?? 'Unassigned'}</span>
            {ticket.assigned_to !== meId ? (
                <button type="button" disabled={pending} className={LINK} onClick={() => onAssign(meId)}>Assign to me</button>
            ) : null}
            {ticket.assigned_to !== null ? (
                <button type="button" disabled={pending} className={LINK} onClick={() => onAssign(null)}>Unassign</button>
            ) : null}
            {canPickOthers && !picking ? (
                <button type="button" className={LINK} onClick={() => setPicking(true)}>Assign to…</button>
            ) : null}
            {picking ? (
                <AssigneePicker onPick={(staffId) => { setPicking(false); onAssign(staffId); }} />
            ) : null}
        </div>
    );
}
