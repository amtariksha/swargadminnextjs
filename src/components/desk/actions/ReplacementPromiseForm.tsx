'use client';

// Replacement promise: record only. The ticket goes on hold until the follow-up; "Replacement
// received" in the money bar resolves it later.

import { useState } from 'react';
import { dateInputClassName, inputClassName, selectClassName, textareaClassName, timeInputClassName } from '@/components/FormField';
import { actionErrorText, classifyPart, defaultCategorySlug, replacementActionBody, replacementDefaults } from '@/lib/desk/action-plan';
import type { DeskActionContext } from '@/lib/desk/action-context';
import { useTicketAction } from '@/lib/desk/action-mutations';
import { istToday } from '@/lib/desk/business-hours';
import { describeDeskError } from '@/lib/desk/desk-query';
import { groupCategoriesByType, istIsoAt } from '@/lib/desk/ticket-format';
import { useDeskCategories } from '@/lib/desk/ticket-hooks';
import { TICKET_TYPE_LABEL } from '@/lib/desk/ticket-labels';
import { ActionDrawer } from './ActionDrawer';
import type { DrawerSession } from './MoneyActions';

interface Props { ctx: DeskActionContext; session: DrawerSession; onClose: () => void }

export function ReplacementPromiseForm({ ctx, session, onClose }: Props) {
    const categories = useDeskCategories();
    const action = useTicketAction(ctx.ticket.id);
    const defaults = replacementDefaults(session.nowMs);
    const [date, setDate] = useState(defaults.promised_date);
    const [time, setTime] = useState(defaults.follow_up_hhmm);
    const [product, setProduct] = useState(ctx.ticket.product_name ?? '');
    const [note, setNote] = useState('');
    const [slug, setSlug] = useState(defaultCategorySlug(ctx.ticket) ?? '');
    const [error, setError] = useState('');
    const followUpAt = date !== '' && time !== '' ? istIsoAt(date, time) : '';
    const futureOk = followUpAt !== '' && Date.parse(followUpAt) > session.nowMs;
    const canSubmit = !action.isPending && note.trim() !== '' && slug !== '' && date !== '' && futureOk;

    const submit = () => {
        setError('');
        action.mutate(replacementActionBody({
            clientActionId: session.clientActionId, seen: session.seen, ticketNo: ctx.ticket.ticket_no,
            promisedDate: date, note: note.trim(), productName: product.trim() || null, followUpAt,
            classify: classifyPart(slug, ctx.ticket, ctx.detail.events),
        }), {
            onSuccess: (outcome) => { ctx.onRecorded(outcome); onClose(); },
            onError: (cause) => setError(actionErrorText(describeDeskError(cause).code, cause.message)),
        });
    };

    return (
        <ActionDrawer title="Promise a replacement" open onClose={onClose} closable={!action.isPending}>
            <div className="space-y-3 text-sm text-slate-300">
                <label className="block space-y-1">
                    <span>Promised date</span>
                    <input type="date" value={date} min={istToday(new Date(session.nowMs))} className={dateInputClassName}
                        onChange={(event) => setDate(event.target.value)} />
                </label>
                <label className="block space-y-1">
                    <span>Follow-up time</span>
                    <input type="time" value={time} className={timeInputClassName} onChange={(event) => setTime(event.target.value)} />
                </label>
                <label className="block space-y-1">
                    <span>Product (optional)</span>
                    <input type="text" maxLength={250} value={product} className={inputClassName}
                        onChange={(event) => setProduct(event.target.value)} />
                </label>
                <label className="block space-y-1">
                    <span>Note</span>
                    <textarea rows={3} maxLength={1000} value={note} className={textareaClassName}
                        onChange={(event) => setNote(event.target.value)} />
                </label>
                <label className="block space-y-1">
                    <span>Category</span>
                    <select className={selectClassName} value={slug} onChange={(event) => setSlug(event.target.value)}>
                        <option value="">Choose a category…</option>
                        {groupCategoriesByType(categories.items).map((group) => (
                            <optgroup key={group.type} label={TICKET_TYPE_LABEL[group.type]}>
                                {group.items.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}
                            </optgroup>
                        ))}
                    </select>
                </label>
                {followUpAt !== '' && !futureOk ? <p className="text-xs text-amber-300">Pick a follow-up time in the future.</p> : null}
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
                <button type="button" disabled={!canSubmit} onClick={submit}
                    className="w-full rounded-xl bg-green-600 px-3 py-2 text-white disabled:opacity-50">
                    {action.isPending ? 'Saving…' : 'Hold until follow-up'}
                </button>
            </div>
        </ActionDrawer>
    );
}
