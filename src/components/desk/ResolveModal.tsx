'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { ResolveFields } from '@/components/desk/ResolveFields';
import {
    noteIsRequired, resolveMissing, wrapUpMissing, type ResolveDraft, type ResolveMissing,
} from '@/lib/desk/resolve-plan';
import { resolveMissingText } from '@/lib/desk/ticket-labels';
import type { Category, Ticket } from '@/lib/desk/types';

interface ResolveModalProps {
    mode: 'resolve' | 'wrap_up';
    ticket: Pick<Ticket, 'ticket_no' | 'category_slug' | 'suggested_category' | 'link_status'>;
    categories: readonly Category[];
    bySlug: ReadonlyMap<string, Category>;
    initialDraft: ResolveDraft;
    pending: boolean;
    /** A server refusal (a 422) to show under the fields. */
    error: string | null;
    onSubmit: (draft: ResolveDraft) => void;
    onClose: () => void;
}

/** Mount with a fresh `key` each time it opens: the draft is initialised once from `initialDraft`. */
export function ResolveModal({
    mode, ticket, categories, bySlug, initialDraft, pending, error, onSubmit, onClose,
}: ResolveModalProps) {
    const [draft, setDraft] = useState<ResolveDraft>(() => initialDraft);
    const category = draft.category_slug === null ? null : bySlug.get(draft.category_slug) ?? null;
    const missing: ResolveMissing[] = mode === 'resolve'
        ? resolveMissing(ticket, category, draft)
        : wrapUpMissing(category, draft);
    const title = mode === 'resolve' ? `Resolve #${ticket.ticket_no}` : `Wrap up #${ticket.ticket_no}`;
    return (
        <Modal isOpen onClose={onClose} title={title} size="lg">
            <ResolveFields
                mode={mode}
                ticket={ticket}
                categories={categories}
                bySlug={bySlug}
                draft={draft}
                noteRequired={noteIsRequired(draft)}
                onChange={(patch) => setDraft((previous) => ({ ...previous, ...patch }))}
            />
            {missing.length > 0 ? <p className="mt-3 text-sm text-amber-300">{resolveMissingText(missing[0])}</p> : null}
            {error !== null ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">Cancel</button>
                <button
                    type="button"
                    disabled={missing.length > 0 || pending}
                    onClick={() => onSubmit(draft)}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
                >
                    {mode === 'resolve' ? 'Resolve ticket' : 'Save wrap-up'}
                </button>
            </div>
        </Modal>
    );
}
