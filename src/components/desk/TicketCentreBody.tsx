'use client';

// P3c: the chat thread and composer live in the one .whatsapp-shell wrapper below; the tab bar, timeline, playbook and every non-thread state are admin kit outside it.

import { useMemo, useState } from 'react';
import MarkdownView from '@/components/crm/MarkdownView';
import { DeskComposer } from '@/components/desk/DeskComposer';
import { DeskErrorState } from '@/components/desk/DeskErrorState';
import { DeskThread } from '@/components/desk/DeskThread';
import { TicketTimeline } from '@/components/desk/TicketTimeline';
import { describeDeskError } from '@/lib/desk/desk-query';
import { useTicketMessages } from '@/lib/desk/message-hooks';
import { lastIncomingAt } from '@/lib/desk/thread-format';
import { inboxHref, isNewerInbound } from '@/lib/desk/ticket-format';
import { buildTimeline } from '@/lib/desk/ticket-timeline';
import type { Category, TicketDetail } from '@/lib/desk/types';

type CentreTab = 'chat' | 'timeline' | 'playbook';

const TAB_BASE = 'rounded-lg px-3 py-1.5 text-sm font-medium transition-all';
const TAB_ACTIVE = 'bg-purple-600/20 text-purple-400 border border-purple-500/30';
const TAB_IDLE = 'text-slate-400 hover:text-white hover:bg-slate-800/50';

interface TicketCentreBodyProps {
    detail: TicketDetail;
    bySlug: ReadonlyMap<string, Category>;
    /** The panel's seen-token and the callback that moves it to ticket.last_inbound_at. */
    seen: string | null;
    onSeen: () => void;
}

/** The middle of the ticket screen: chat thread + composer, timeline, playbook. Nothing here opens a dialog. */
export function TicketCentreBody({ detail, bySlug, seen, onSeen }: TicketCentreBodyProps) {
    const { ticket, conversation } = detail;
    const [tab, setTab] = useState<CentreTab>(() => (conversation === null ? 'timeline' : 'chat'));
    const thread = useTicketMessages(ticket.id, conversation !== null);
    const rows = useMemo(
        () => buildTimeline(detail.events, detail.actions, bySlug),
        [detail.events, detail.actions, bySlug],
    );
    const lastIncoming = useMemo(
        () => lastIncomingAt(thread.messages, ticket.last_inbound_at),
        [thread.messages, ticket.last_inbound_at],
    );
    const playbook = detail.category?.playbook_md ?? '';
    const hasPlaybook = playbook.trim() !== '';
    const shown: CentreTab = tab === 'playbook' && !hasPlaybook ? 'timeline' : tab;
    const onChat = shown === 'chat';
    const tabClass = (key: CentreTab) => `${TAB_BASE} ${key === shown ? TAB_ACTIVE : TAB_IDLE}`;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-1 border-b border-slate-800/50 px-4 py-2">
                <button type="button" onClick={() => setTab('chat')} className={tabClass('chat')}>
                    Chat
                    {!onChat && isNewerInbound(ticket.last_inbound_at, seen) ? (
                        <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-400" />
                    ) : null}
                </button>
                <button type="button" onClick={() => setTab('timeline')} className={tabClass('timeline')}>
                    Timeline ({rows.length})
                </button>
                {hasPlaybook ? (
                    <button type="button" onClick={() => setTab('playbook')} className={tabClass('playbook')}>Playbook</button>
                ) : null}
                {conversation !== null ? (
                    <a
                        href={inboxHref(ticket.integrated_number)}
                        target="_blank"
                        rel="noreferrer"
                        title={`Search for ${ticket.customer_phone ?? 'the customer'} there`}
                        className="ml-auto text-xs text-slate-400 underline hover:text-white"
                    >
                        Open in old inbox
                    </a>
                ) : null}
            </div>
            {onChat && conversation === null ? (
                <p className="p-4 text-sm text-slate-400">This ticket has no conversation.</p>
            ) : null}
            {onChat && conversation !== null && !thread.hasData && thread.error === null ? (
                <div className="flex justify-center py-8"><div className="spinner h-8 w-8" /></div>
            ) : null}
            {onChat && !thread.hasData && thread.error !== null ? (
                <div className="p-4"><DeskErrorState error={thread.error} onRetry={thread.refresh} /></div>
            ) : null}
            {onChat && thread.hasData && thread.error !== null ? (
                <p className="px-4 py-1 text-xs text-amber-300">Messages are not updating: {describeDeskError(thread.error).text}</p>
            ) : null}
            {conversation !== null && thread.hasData ? (
                <div className={onChat ? 'whatsapp-shell flex min-h-0 flex-1 flex-col bg-white' : 'hidden'}>
                    <DeskThread
                        thread={thread}
                        conversation={conversation}
                        lastInboundAt={ticket.last_inbound_at}
                        lastIncomingTimestamp={lastIncoming}
                        visible={onChat}
                        seen={seen}
                        onSeen={onSeen}
                    />
                    <DeskComposer conversation={conversation} lastIncomingTimestamp={lastIncoming} onSent={thread.addSent} />
                </div>
            ) : null}
            {shown === 'timeline' ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-4"><TicketTimeline rows={rows} /></div>
            ) : null}
            {shown === 'playbook' ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-slate-300"><MarkdownView content={playbook} /></div>
            ) : null}
        </div>
    );
}
