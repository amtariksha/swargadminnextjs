'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CategoryPickerModal } from '@/components/desk/CategoryPickerModal';
import { HoldModal } from '@/components/desk/HoldModal';
import { ResolveModal } from '@/components/desk/ResolveModal';
import { TicketBanners } from '@/components/desk/TicketBanners';
import { TicketCentreBody } from '@/components/desk/TicketCentreBody';
import { TicketHeader, type TicketHeaderActions } from '@/components/desk/TicketHeader';
import { describeDeskError, type ResolveOutcome } from '@/lib/desk/desk-query';
import {
    buildResolveBody, buildWrapUpBody, classificationSourceFor, initialResolveDraft, presetStart,
    resolveMissing, wrapUpDraft, type ResolveDraft,
} from '@/lib/desk/resolve-plan';
import { isNewerInbound, type DeskTab } from '@/lib/desk/ticket-format';
import { useDeskCategories } from '@/lib/desk/ticket-hooks';
import { useTicketPatch, useTicketResolve } from '@/lib/desk/ticket-mutations';
import type { TicketDetail } from '@/lib/desk/types';

type Dialog =
    | { kind: 'none' }
    | { kind: 'category' }
    | { kind: 'hold' }
    | { kind: 'resolve' | 'wrap_up'; draft: ResolveDraft; nonce: number };

interface TicketPanelLoadedProps {
    detail: TicketDetail;
    tab: DeskTab;
    onRefetch: () => void;
}

/** Holds the seen-token (rules U-1 to U-4) and the dialog state of one open ticket. */
export function TicketPanelLoaded({ detail, tab, onRefetch }: TicketPanelLoadedProps) {
    const { ticket } = detail;
    const categories = useDeskCategories();
    const patch = useTicketPatch(ticket.id);
    const resolve = useTicketResolve(ticket.id);
    const [seen, setSeen] = useState<string | null>(() => ticket.last_inbound_at);
    const [refused, setRefused] = useState(false);
    const [savedDraft, setSavedDraft] = useState<ResolveDraft | null>(null);
    const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
    const [dialogError, setDialogError] = useState<string | null>(null);

    const unseen = isNewerInbound(ticket.last_inbound_at, seen);
    const resolveBlock = unseen ? 'Read the new message first' : categories.items.length === 0 ? 'No categories configured' : null;
    const currentCategory = categories.bySlug.get(ticket.category_slug ?? '') ?? null;
    const close = () => setDialog({ kind: 'none' });
    const markRead = () => { setSeen(ticket.last_inbound_at); setRefused(false); };
    const onSeen = () => { if (!refused && dialog.kind === 'none') setSeen(ticket.last_inbound_at); }; // R-3C1, D-4
    const openDialog = (kind: 'resolve' | 'wrap_up', draft: ResolveDraft) => {
        setDialogError(null);
        setDialog({ kind, draft, nonce: Date.now() });
    };
    const report = (error: Error) => toast.error(describeDeskError(error).text);
    const reportInDialog = (error: Error) => {
        const { text, inline } = describeDeskError(error);
        if (inline) setDialogError(text);
        else toast.error(text);
    };

    const onResolved = (draft: ResolveDraft, outcome: ResolveOutcome) => {
        close();
        const resolvedNow = outcome.kind === 'resolved';
        setSavedDraft(resolvedNow ? null : draft);
        setRefused(!resolvedNow);
        if (resolvedNow) {
            toast.success(outcome.already_resolved ? 'Already resolved' : `Ticket #${ticket.ticket_no} resolved`);
        } else if (!isNewerInbound(outcome.ticket.last_inbound_at, seen)) {
            setSeen(outcome.ticket.last_inbound_at);
            toast.error('The ticket changed. Try again.');
        }
    };

    const sendResolve = (draft: ResolveDraft) => {
        const category = categories.bySlug.get(draft.category_slug ?? '');
        if (category === undefined) return;
        setDialogError(null);
        resolve.mutate(buildResolveBody(seen, ticket, category, draft), {
            onSuccess: (outcome) => onResolved(draft, outcome),
            onError: reportInDialog,
        });
    };

    const startResolve = (draft: ResolveDraft, forceDialog: boolean) => {
        const category = categories.bySlug.get(draft.category_slug ?? '') ?? null;
        if (!forceDialog && resolveMissing(ticket, category, draft).length === 0) sendResolve(draft);
        else openDialog('resolve', draft);
    };

    const saveWrapUp = (draft: ResolveDraft) => {
        setDialogError(null);
        patch.mutate(buildWrapUpBody(draft), {
            onSuccess: () => { toast.success('Wrap-up saved'); close(); },
            onError: (error) => {
                if (describeDeskError(error).code !== 'ticket_not_resolved') return reportInDialog(error);
                report(error);
                onRefetch();
                close();
            },
        });
    };

    const actions: TicketHeaderActions = {
        onClassify: (slug) => patch.mutate(
            { op: 'classify', category_slug: slug, classification_source: classificationSourceFor(slug, ticket, detail.events) },
            { onError: report, onSuccess: close },
        ),
        onOpenPicker: () => setDialog({ kind: 'category' }),
        onAssign: (assignedTo) => patch.mutate({ op: 'assign', assigned_to: assignedTo }, { onError: report }),
        onOpenHold: () => setDialog({ kind: 'hold' }),
        onReleaseHold: () => patch.mutate({ op: 'release_hold' }, { onError: report }),
        onResolve: () => startResolve(savedDraft ?? initialResolveDraft(ticket, currentCategory), false),
        onPreset: (preset) => {
            const { draft, forceDialog } = presetStart(preset, ticket, detail.events);
            startResolve(draft, forceDialog);
        },
        onWrapUp: () => openDialog('wrap_up', wrapUpDraft(ticket, currentCategory)),
        onRefresh: onRefetch,
    };
    const busy = patch.isPending || resolve.isPending;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <TicketHeader detail={detail} tab={tab} categories={categories} resolveBlock={resolveBlock} busy={busy} actions={actions} />
            <TicketBanners detail={detail} tab={tab} unseen={unseen} refused={refused} onMarkRead={markRead} />
            <TicketCentreBody detail={detail} bySlug={categories.bySlug} seen={seen} onSeen={onSeen} />
            {dialog.kind === 'category' ? (
                <CategoryPickerModal categories={categories.items} currentSlug={ticket.category_slug} onPick={actions.onClassify} onClose={close} />
            ) : null}
            {dialog.kind === 'hold' ? <HoldModal ticketId={ticket.id} onClose={close} /> : null}
            {dialog.kind === 'resolve' || dialog.kind === 'wrap_up' ? (
                <ResolveModal
                    key={dialog.nonce}
                    mode={dialog.kind}
                    ticket={ticket}
                    categories={categories.items}
                    bySlug={categories.bySlug}
                    initialDraft={dialog.draft}
                    pending={busy}
                    error={dialogError}
                    onSubmit={dialog.kind === 'resolve' ? sendResolve : saveWrapUp}
                    onClose={close}
                />
            ) : null}
        </div>
    );
}
