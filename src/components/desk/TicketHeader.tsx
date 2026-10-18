'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AssigneeMenu } from '@/components/desk/AssigneeMenu';
import { CategoryChips } from '@/components/desk/CategoryChips';
import { useDeskMe } from '@/components/desk/desk-me-context';
import { PresetMenu } from '@/components/desk/PresetMenu';
import { useEmbedMode, useNowMs } from '@/lib/desk/browser-hooks';
import type { ResolvePreset } from '@/lib/desk/resolve-plan';
import { deskHref, formatIstDateTime, formatWaiting, waitingSecsAt, type DeskTab } from '@/lib/desk/ticket-format';
import { HOLD_REASON_LABEL, RESOLUTION_CODE_LABEL, TICKET_STATUS_LABEL } from '@/lib/desk/ticket-labels';
import type { DeskCategories } from '@/lib/desk/ticket-hooks';
import type { TicketDetail } from '@/lib/desk/types';

export interface TicketHeaderActions {
    onClassify: (slug: string) => void;
    onOpenPicker: () => void;
    onAssign: (assignedTo: string | null) => void;
    onOpenHold: () => void;
    onReleaseHold: () => void;
    onResolve: () => void;
    onPreset: (preset: ResolvePreset) => void;
    onWrapUp: () => void;
    onRefresh: () => void;
}

interface TicketHeaderProps {
    detail: TicketDetail;
    tab: DeskTab;
    categories: DeskCategories;
    /** Why Resolve, the presets and wrap-up are disabled; null when they are enabled. */
    resolveBlock: string | null;
    busy: boolean;
    actions: TicketHeaderActions;
}

const BUTTON = 'rounded-lg px-3 py-1.5 text-sm disabled:opacity-50';
const SECONDARY = `${BUTTON} bg-slate-800 text-slate-200 hover:bg-slate-700`;

function copyPhone(phone: string): void {
    navigator.clipboard.writeText(phone).then(
        () => toast.success('Copied'),
        () => toast.error('Could not copy'),
    );
}

export function TicketHeader({ detail, tab, categories, resolveBlock, busy, actions }: TicketHeaderProps) {
    const router = useRouter();
    const me = useDeskMe();
    const embed = useEmbedMode();
    const nowMs = useNowMs(30_000);
    const { ticket } = detail;
    const resolved = ticket.status === 'resolved';
    const waiting = waitingSecsAt(ticket.attention_since, nowMs, ticket.waiting_secs);
    const canPickOthers = !embed && me.via !== 'delivery_capability';

    return (
        <header className="space-y-2 border-b border-slate-800/50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => router.push(deskHref(null, tab))} className="lg:hidden" aria-label="Back to the queue">
                    <ArrowLeft className="h-5 w-5 text-slate-300" />
                </button>
                <span className="text-sm font-semibold text-white">#{ticket.ticket_no}</span>
                <span className="text-sm text-white">{ticket.customer_name ?? 'Unknown'}</span>
                {ticket.customer_phone !== null ? (
                    <button type="button" onClick={() => copyPhone(ticket.customer_phone ?? '')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white">
                        {ticket.customer_phone} <Copy className="h-3 w-3" />
                    </button>
                ) : null}
                <span className="text-xs text-slate-500">{ticket.integrated_number ?? 'default number'}</span>
                <span className="rounded-md bg-blue-500/20 px-1.5 py-0.5 text-[11px] text-blue-400">{ticket.queue === 'care' ? 'Care' : 'Sales'}</span>
                <button type="button" onClick={actions.onRefresh} className="ml-auto text-slate-400 hover:text-white" aria-label="Refresh">
                    <RefreshCw className="h-4 w-4" />
                </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-md bg-slate-700/50 px-2 py-0.5 text-xs text-slate-200">{TICKET_STATUS_LABEL[ticket.status]}</span>
                {ticket.overdue ? <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-xs text-red-400">Overdue</span> : null}
                <span className={`text-xs ${ticket.overdue ? 'text-red-400' : 'text-slate-400'}`}>
                    {ticket.attention_since !== null ? `Waiting ${formatWaiting(waiting)}` : 'No one is waiting'}
                </span>
                {!resolved ? (
                    <AssigneeMenu ticket={ticket} meId={me.user.id} canPickOthers={canPickOthers} pending={busy} onAssign={actions.onAssign} />
                ) : null}
            </div>
            {ticket.status === 'on_hold' && ticket.hold_reason !== null ? (
                <p className="text-sm text-amber-300">
                    On hold: {HOLD_REASON_LABEL[ticket.hold_reason]} · follow up {formatIstDateTime(ticket.follow_up_at)}{' '}
                    <button type="button" disabled={busy} onClick={actions.onReleaseHold} className="ml-2 underline">Release hold</button>
                </p>
            ) : null}
            {resolved ? (
                <div className="space-y-1 text-sm text-slate-300">
                    <p>
                        {ticket.resolution_code !== null ? RESOLUTION_CODE_LABEL[ticket.resolution_code] : 'Resolved'} · {ticket.resolved_via ?? 'manual'} ·{' '}
                        {ticket.resolved_by_name ?? 'system'} · {formatIstDateTime(ticket.resolved_at)}
                    </p>
                    {ticket.resolution_note !== null ? <p className="text-slate-400">{ticket.resolution_note}</p> : null}
                    <button type="button" disabled={resolveBlock !== null || busy} title={resolveBlock ?? undefined} onClick={actions.onWrapUp} className={SECONDARY}>
                        {ticket.category_slug === null ? 'Wrap up' : 'Edit classification'}
                    </button>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <CategoryChips ticket={ticket} categories={categories} disabled={busy} onClassify={actions.onClassify} onOpenPicker={actions.onOpenPicker} />
                    <span className="ml-auto flex items-center gap-2">
                        <button type="button" disabled={busy} onClick={actions.onOpenHold} className={SECONDARY}>
                            {ticket.status === 'on_hold' ? 'Change hold' : 'Hold'}
                        </button>
                        <PresetMenu availableSlugs={new Set(categories.items.map((item) => item.slug))} disabled={resolveBlock !== null || busy} disabledReason={resolveBlock} onPick={actions.onPreset} contact={{ phone: ticket.customer_phone, name: ticket.customer_name }} />
                        <button
                            type="button"
                            disabled={resolveBlock !== null || busy}
                            title={resolveBlock ?? undefined}
                            onClick={actions.onResolve}
                            className={`${BUTTON} bg-purple-600 text-white hover:bg-purple-500`}
                        >
                            Resolve
                        </button>
                    </span>
                </div>
            )}
        </header>
    );
}
