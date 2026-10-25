'use client';

// Wallet credit: /add_txn from the browser (as the admin pages do), then record it on the ticket.
// "Retry recording" re-posts the same body; /add_txn is never called twice for one drawer.

import { useState } from 'react';
import { inputClassName, selectClassName } from '@/components/FormField';
import { useAddTransaction } from '@/hooks/useData';
import { ApiError } from '@/lib/api-error';
import type { TicketActionBody } from '@/lib/desk/contracts';
import {
    actionErrorText, canRetryRecording, classifyPart, defaultCategorySlug, moneyBlockReason, noDeliveryLinkBody,
    walletCreditActionBody, walletDescription, walletPaymentId,
} from '@/lib/desk/action-plan';
import type { DeskActionContext } from '@/lib/desk/action-context';
import { useTicketAction } from '@/lib/desk/action-mutations';
import { describeDeskError } from '@/lib/desk/desk-query';
import { groupCategoriesByType } from '@/lib/desk/ticket-format';
import { useDeskCategories } from '@/lib/desk/ticket-hooks';
import { TICKET_TYPE_LABEL } from '@/lib/desk/ticket-labels';
import { useTicketPatch } from '@/lib/desk/ticket-mutations';
import { ActionDrawer } from './ActionDrawer';
import type { DrawerSession } from './MoneyActions';

type Stage =
    | { kind: 'edit' } | { kind: 'crediting' } | { kind: 'recording' }
    | { kind: 'failed'; body: TicketActionBody; code: Parameters<typeof canRetryRecording>[0]; text: string };

interface Props { ctx: DeskActionContext; session: DrawerSession; onClose: () => void }

const MAX_CREDIT = 100000;
const NO_LINK_CHOICES = [
    { value: 'none_found', label: 'No matching delivery' },
    { value: 'not_a_customer', label: 'Not a customer' },
] as const;

export function WalletCreditForm({ ctx, session, onClose }: Props) {
    const categories = useDeskCategories();
    const addTxn = useAddTransaction();
    const patch = useTicketPatch(ctx.ticket.id);
    const action = useTicketAction(ctx.ticket.id);
    const [stage, setStage] = useState<Stage>({ kind: 'edit' });
    const [amount, setAmount] = useState('');
    const [slug, setSlug] = useState(defaultCategorySlug(ctx.ticket) ?? '');
    const [description, setDescription] = useState('');
    const [descriptionTouched, setDescriptionTouched] = useState(false);
    const [closeTicket, setCloseTicket] = useState(true);
    const [noLink, setNoLink] = useState<'none_found' | 'not_a_customer' | ''>('');
    const [error, setError] = useState('');
    // Once /add_txn was called the credit may have landed even if the call failed: never call it again from this drawer.
    const [creditAttempted, setCreditAttempted] = useState(false);
    const profile = ctx.snapshot.profile;
    const category = categories.bySlug.get(slug) ?? null;
    const amountNumber = Number(amount);
    const amountValid = Number.isFinite(amountNumber) && amountNumber >= 1 && amountNumber <= MAX_CREDIT;
    const shownDescription = descriptionTouched ? description : walletDescription(category?.label ?? null, ctx.ticket.ticket_no);
    const needsNoLink = closeTicket && category?.requires_delivery_link === true && ctx.ticket.link_status === null;
    const block = amountValid ? moneyBlockReason({
        manager: ctx.me.manager, creditMaxAgent: ctx.me.credit_max_agent, actionType: 'wallet_credit',
        amount: amountNumber, priorMoneyActions: ctx.detail.prior_money_actions.length,
    }) : null;
    const canSubmit = stage.kind === 'edit' && !creditAttempted && profile !== null && amountValid && block === null
        && shownDescription.trim() !== '' && (!closeTicket || slug !== '') && (!needsNoLink || noLink !== '');

    const record = (body: TicketActionBody) => {
        setStage({ kind: 'recording' });
        action.mutate(body, {
            onSuccess: (outcome) => { ctx.onRecorded(outcome); onClose(); },
            onError: (cause) => {
                const code = describeDeskError(cause).code;
                setStage({ kind: 'failed', body, code, text: actionErrorText(code, cause.message) });
            },
        });
    };

    const credit = async () => {
        if (profile === null) return;
        setError('');
        setStage({ kind: 'crediting' });
        try {
            if (needsNoLink && noLink !== '') await patch.mutateAsync(noDeliveryLinkBody(noLink));
            setCreditAttempted(true);
            const res = await addTxn.mutateAsync({
                user_id: profile.user_id, amount: amountNumber, type: 1, description: shownDescription.trim(),
                payment_id: walletPaymentId(session.clientActionId),
            });
            const out = res as unknown as { id?: number; duplicate_skipped?: boolean };
            if (out.duplicate_skipped || typeof out.id !== 'number' || out.id <= 0) {
                setError('The backend did not credit the wallet (duplicate). Nothing was recorded. Close this window before trying again.');
                setStage({ kind: 'edit' });
                return;
            }
            record(walletCreditActionBody({
                clientActionId: session.clientActionId, seen: session.seen, resolve: closeTicket, txnId: out.id,
                amount: amountNumber, userId: profile.user_id, description: shownDescription.trim(),
                classify: classifyPart(slug || null, ctx.ticket, ctx.detail.events),
            }));
        } catch (cause) {
            const reason = cause instanceof ApiError ? cause.userMessage
                : describeDeskError(cause instanceof Error ? cause : new Error('Failed')).text;
            setError(`${reason} The credit may still have gone through: check the customer's wallet, then close this window before trying again.`);
            setStage({ kind: 'edit' });
        }
    };

    return (
        <ActionDrawer title="Wallet credit" open onClose={onClose}
            closable={stage.kind !== 'crediting' && stage.kind !== 'recording'}>
            {stage.kind === 'failed' ? (
                <div className="space-y-3 text-sm">
                    <p className="text-red-400">Credit done; recording it on the ticket failed: {stage.text}</p>
                    <div className="flex gap-2">
                        {canRetryRecording(stage.code) ? (
                            <button type="button" onClick={() => record(stage.body)}
                                className="flex-1 rounded-xl bg-green-600 px-3 py-2 text-white">Retry recording</button>
                        ) : null}
                        <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-slate-200">Close</button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3 text-sm text-slate-300">
                    <label className="block space-y-1">
                        <span>Amount (₹)</span>
                        <input type="number" min={1} max={MAX_CREDIT} step={1} value={amount} className={inputClassName}
                            onChange={(event) => setAmount(event.target.value)} />
                    </label>
                    <label className="block space-y-1">
                        <span>Description</span>
                        <input type="text" maxLength={250} value={shownDescription} className={inputClassName}
                            onChange={(event) => { setDescriptionTouched(true); setDescription(event.target.value); }} />
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
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={closeTicket} onChange={(event) => setCloseTicket(event.target.checked)} />
                        Close the ticket
                    </label>
                    {needsNoLink ? (
                        <fieldset className="space-y-1">
                            <legend className="text-xs text-slate-400">This category needs a delivery. None is linked:</legend>
                            {NO_LINK_CHOICES.map((choice) => (
                                <label key={choice.value} className="flex items-center gap-2">
                                    <input type="radio" name="no-link" checked={noLink === choice.value}
                                        onChange={() => setNoLink(choice.value)} />
                                    {choice.label}
                                </label>
                            ))}
                        </fieldset>
                    ) : null}
                    {block ? <p className="text-xs text-amber-300">{block}</p> : null}
                    {error ? <p className="text-sm text-red-400">{error}</p> : null}
                    <button type="button" disabled={!canSubmit} onClick={() => { void credit(); }}
                        className="w-full rounded-xl bg-green-600 px-3 py-2 text-white disabled:opacity-50">
                        {stage.kind === 'crediting' ? 'Crediting…' : stage.kind === 'recording' ? 'Recording…' : 'Credit wallet'}
                    </button>
                </div>
            )}
        </ActionDrawer>
    );
}
