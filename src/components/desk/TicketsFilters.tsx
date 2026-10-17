'use client';

import { useState } from 'react';
import { dateInputClassName, inputClassName, selectClassName } from '@/components/FormField';
import { QUEUES, TICKET_STATUSES, TICKET_TYPES, type Queue, type TicketStatus, type TicketType } from '@/lib/desk/constants';
import { TICKET_STATUS_LABEL, TICKET_TYPE_LABEL } from '@/lib/desk/ticket-labels';
import type { TicketListFilters } from '@/lib/desk/ticket-hooks';
import type { Category } from '@/lib/desk/types';

export interface TicketsFilterValues {
    from: string;
    to: string;
    status: TicketStatus | '';
    queue: Queue | '';
    type: TicketType | '';
    category_slug: string;
    assignedToMe: boolean;
    q: string;
}

/** Empty choices are left out so the request carries only what the exec set. */
export function toListFilters(values: TicketsFilterValues, meId: string): TicketListFilters {
    return {
        from: values.from,
        to: values.to,
        ...(values.status !== '' ? { status: values.status } : {}),
        ...(values.queue !== '' ? { queue: values.queue } : {}),
        ...(values.type !== '' ? { type: values.type } : {}),
        ...(values.category_slug !== '' ? { category_slug: values.category_slug } : {}),
        ...(values.assignedToMe ? { assigned_to: meId } : {}),
        ...(values.q.trim().length >= 2 ? { q: values.q.trim() } : {}),
    };
}

interface TicketsFiltersProps {
    initial: TicketsFilterValues;
    categories: readonly Category[];
    onApply: (values: TicketsFilterValues) => void;
}

const LABEL = 'mb-1 block text-xs font-medium text-slate-400';

/** The draft lives here; the query runs only on the values passed to onApply. */
export function TicketsFilters({ initial, categories, onApply }: TicketsFiltersProps) {
    const [draft, setDraft] = useState<TicketsFilterValues>(() => initial);
    const set = (patch: Partial<TicketsFilterValues>) => setDraft((previous) => ({ ...previous, ...patch }));
    return (
        <form
            onSubmit={(event) => { event.preventDefault(); onApply(draft); }}
            className="glass flex flex-wrap items-end gap-3 rounded-xl p-4"
        >
            <div>
                <label className={LABEL}>From</label>
                <input type="date" value={draft.from} onChange={(e) => set({ from: e.target.value })} className={dateInputClassName} />
            </div>
            <div>
                <label className={LABEL}>To</label>
                <input type="date" value={draft.to} onChange={(e) => set({ to: e.target.value })} className={dateInputClassName} />
            </div>
            <div>
                <label className={LABEL}>Status</label>
                <select value={draft.status} onChange={(e) => set({ status: TICKET_STATUSES.find((s) => s === e.target.value) ?? '' })} className={selectClassName}>
                    <option value="">Any</option>
                    {TICKET_STATUSES.map((status) => <option key={status} value={status}>{TICKET_STATUS_LABEL[status]}</option>)}
                </select>
            </div>
            <div>
                <label className={LABEL}>Queue</label>
                <select value={draft.queue} onChange={(e) => set({ queue: QUEUES.find((q) => q === e.target.value) ?? '' })} className={selectClassName}>
                    <option value="">Any</option>
                    {QUEUES.map((queue) => <option key={queue} value={queue}>{queue === 'care' ? 'Care' : 'Sales'}</option>)}
                </select>
            </div>
            <div>
                <label className={LABEL}>Type</label>
                <select value={draft.type} onChange={(e) => set({ type: TICKET_TYPES.find((t) => t === e.target.value) ?? '' })} className={selectClassName}>
                    <option value="">Any</option>
                    {TICKET_TYPES.map((type) => <option key={type} value={type}>{TICKET_TYPE_LABEL[type]}</option>)}
                </select>
            </div>
            <div>
                <label className={LABEL}>Category</label>
                <select value={draft.category_slug} onChange={(e) => set({ category_slug: e.target.value })} className={selectClassName}>
                    <option value="">Any</option>
                    {categories.map((category) => <option key={category.slug} value={category.slug}>{category.label}</option>)}
                </select>
            </div>
            <div>
                <label className={LABEL}>Search name or phone</label>
                <input value={draft.q} maxLength={60} onChange={(e) => set({ q: e.target.value })} className={inputClassName} />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-200">
                <input type="checkbox" checked={draft.assignedToMe} onChange={(e) => set({ assignedToMe: e.target.checked })} />
                Assigned to me
            </label>
            <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-500">Apply</button>
        </form>
    );
}
