'use client';

// Shared by every drawer of the ops actions: the one place that posts a record (useTicketAction) and
// the "Resolve the ticket" choice (D-3).

import { useState } from 'react';
import { selectClassName } from '@/components/FormField';
import type { ActionPostOutcome } from '@/lib/desk/action-client';
import type { DeskActionContext } from '@/lib/desk/action-context';
import { useTicketAction } from '@/lib/desk/action-mutations';
import type { TicketActionBody } from '@/lib/desk/contracts';
import { recordFailure, type OpsResolveChoice, type RecordFailure } from '@/lib/desk/ops-actions';
import type { Category } from '@/lib/desk/types';

export interface RecordAndClose {
    /** Resolves null after the record was posted, `ctx.onRecorded` called and the drawer closed; else the failure. */
    record: (body: TicketActionBody, beforeClose?: (outcome: ActionPostOutcome) => void) => Promise<RecordFailure | null>;
    pending: boolean;
}

export function useRecordAndClose(ctx: DeskActionContext, onDone: () => void): RecordAndClose {
    const action = useTicketAction(ctx.ticket.id);
    const record = async (body: TicketActionBody, beforeClose?: (outcome: ActionPostOutcome) => void) => {
        try {
            const outcome = await action.mutateAsync(body);
            beforeClose?.(outcome);
            ctx.onRecorded(outcome);
            onDone();
            return null;
        } catch (error) {
            return recordFailure(error);
        }
    };
    return { record, pending: action.isPending };
}

interface ResolveChoiceProps {
    plan: { initial: OpsResolveChoice; options: Category[] };
    current: Category | null;
    value: OpsResolveChoice;
    onChange: (next: OpsResolveChoice) => void;
    disabled: boolean;
}

export function ResolveChoice({ plan, current, value, onChange, disabled }: ResolveChoiceProps) {
    if (value.locked === 'resolved') {
        return <p className="text-xs text-slate-400">The ticket is already resolved: this is recorded only.</p>;
    }
    if (value.locked === 'no_category') {
        return <p className="text-xs text-slate-400">No matching category is active: this is recorded and the ticket stays open.</p>;
    }
    return (
        <div className="space-y-2 text-sm text-slate-300">
            <label className="flex items-center gap-2">
                <input type="checkbox" checked={value.resolve} disabled={disabled}
                    onChange={(event) => onChange({ ...value, resolve: event.target.checked })} />
                Resolve the ticket
            </label>
            {value.resolve ? (
                <select className={selectClassName} value={value.category_slug ?? ''} disabled={disabled}
                    onChange={(event) => onChange({ ...value, category_slug: event.target.value })}>
                    {plan.options.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}
                </select>
            ) : null}
            {!value.resolve && current?.type === 'complaint' ? (
                <p className="text-xs text-slate-400">This complaint stays open. Resolve it from the header with the right resolution.</p>
            ) : null}
        </div>
    );
}

/** The override-or-initial choice every drawer keeps: `useState(null)` until the exec touches the checkbox. */
export function useResolveChoice(initial: OpsResolveChoice): [OpsResolveChoice, (next: OpsResolveChoice) => void] {
    const [override, setOverride] = useState<OpsResolveChoice | null>(null);
    return [override ?? initial, setOverride];
}

/** The failure of a record that did not land: text plus the one action that can still help. */
export function FailureNotice({ failure, onRetry, onRecordOnly }: {
    failure: RecordFailure; onRetry: () => void; onRecordOnly: () => void;
}) {
    const button = 'w-full rounded-xl bg-green-600 px-3 py-2 text-sm text-white';
    return (
        <div className="space-y-2 text-sm">
            <p className="text-red-400">{failure.text}</p>
            {failure.kind === 'precondition' ? <button type="button" className={button} onClick={onRecordOnly}>Record without resolving</button> : null}
            {failure.kind === 'retry' ? <button type="button" className={button} onClick={onRetry}>Retry</button> : null}
        </div>
    );
}
