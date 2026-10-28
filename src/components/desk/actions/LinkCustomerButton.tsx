'use client';

// Link the WhatsApp number to an address-phone candidate (alternate phone). The confirm is an ActionDrawer
// (never a dialog in the pane). A retry after the backend call succeeded never calls the backend again.

import { useState } from 'react';
import { toast } from 'sonner';
import { POST } from '@/lib/api';
import { newClientActionId } from '@/lib/desk/action-client';
import type { DeskActionContext } from '@/lib/desk/action-context';
import type { TicketActionBody } from '@/lib/desk/contracts';
import {
    buildCustomerLinkedBody, customerLinkNotApplied, linkableCandidates, opsBackendErrorText, readAlternatePhoneResult,
    type RecordFailure,
} from '@/lib/desk/ops-actions';
import type { SnapshotCandidate } from '@/lib/desk/types';
import { ActionDrawer } from './ActionDrawer';
import { FailureNotice, useRecordAndClose } from './OpsRecord';

const label = (candidate: SnapshotCandidate) => `${candidate.name ?? 'this customer'} (…${candidate.phone_tail})`;

function LinkDrawer({ ctx, candidate, onDone }: { ctx: DeskActionContext; candidate: SnapshotCandidate; onDone: () => void }) {
    const [seen] = useState(() => ctx.seenInboundAt);
    const [clientActionId] = useState(newClientActionId);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [last, setLast] = useState<{ body: TicketActionBody; failure: RecordFailure } | null>(null);
    const recorder = useRecordAndClose(ctx, onDone);
    const phone = ctx.snapshot.canonical_phone;

    const record = async (body: TicketActionBody) => {
        const failure = await recorder.record(body, (outcome) => {
            const ticket = outcome.kind === 'done' ? outcome.response.ticket : outcome.ticket;
            if (customerLinkNotApplied(ticket, candidate.user_id)) {
                toast.warning(`The number was linked to ${label(candidate)}, but the ticket's customer was not updated. Check the match banner.`, { duration: 15_000 });
            }
        });
        setLast(failure === null ? null : { body, failure });
    };
    const link = async () => {
        setBusy(true);
        setError('');
        try {
            let result;
            try {
                result = readAlternatePhoneResult(await POST(`/users/${candidate.user_id}/alternate-phones`, { phone, label: 'whatsapp' }));
            } catch (cause) {
                setError(opsBackendErrorText(cause, 'Could not link the number.'));
                return;
            }
            if (result === null) { setError('Unexpected answer from the backend; nothing was recorded.'); return; }
            await record(buildCustomerLinkedBody({ client_action_id: clientActionId, seen_inbound_at: seen }, {
                userId: candidate.user_id, phone, alternatePhoneId: result.alternatePhoneId, alreadyLinked: result.alreadyLinked,
            }));
        } finally {
            setBusy(false);
        }
    };
    const retry = async (body: TicketActionBody) => {
        setBusy(true);
        try { await record(body); } finally { setBusy(false); }
    };

    return (
        <ActionDrawer title="Link this WhatsApp number?" open onClose={onDone} closable={!busy}>
            <div className="space-y-3 text-sm text-slate-300">
                <p>
                    Future messages from {phone} will be matched to {label(candidate)}. The number is added to that
                    customer&apos;s alternate phones.
                </p>
                {error ? <p className="text-red-400">{error}</p> : null}
                {last !== null ? (
                    <FailureNotice failure={last.failure} onRetry={() => { void retry(last.body); }} onRecordOnly={() => { void retry(last.body); }} />
                ) : (
                    <div className="flex gap-2">
                        <button type="button" disabled={busy} onClick={onDone} className="flex-1 rounded-xl bg-slate-800 px-3 py-2">Cancel</button>
                        <button type="button" disabled={busy} onClick={() => { void link(); }}
                            className="flex-1 rounded-xl bg-green-600 px-3 py-2 text-white disabled:opacity-50">{busy ? 'Linking…' : 'Link'}</button>
                    </div>
                )}
            </div>
        </ActionDrawer>
    );
}

export function LinkCustomerButton({ ctx }: { ctx: DeskActionContext }) {
    const [chosen, setChosen] = useState<SnapshotCandidate | null>(null);
    const candidates = linkableCandidates(ctx.snapshot);
    if (candidates.length === 0) return null;
    return (
        <>
            {candidates.map((candidate) => (
                <button key={candidate.user_id} type="button" onClick={() => setChosen(candidate)}
                    className="rounded-lg bg-slate-800 px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-700">
                    Link to {label(candidate)}
                    {candidate.apartment_name || candidate.flat_no
                        ? <span className="block text-slate-400">{[candidate.apartment_name, candidate.flat_no].filter(Boolean).join(' · ')}</span>
                        : null}
                </button>
            ))}
            {chosen !== null ? <LinkDrawer key={chosen.user_id} ctx={ctx} candidate={chosen} onDone={() => setChosen(null)} /> : null}
        </>
    );
}
