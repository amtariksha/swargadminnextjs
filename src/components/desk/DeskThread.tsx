'use client';

import { useEffect, useRef } from 'react';
import { Phone, RefreshCw } from 'lucide-react';
import { MessageThread } from '@/components/whatsapp/inbox/message-thread';
import { SessionTimer } from '@/components/whatsapp/inbox/session-timer';
import { Button } from '@/components/whatsapp/ui/button';
import {
    useDeskVoiceCall, useMarkConversationRead, useThreadScroll, type TicketThread,
} from '@/lib/desk/message-hooks';
import { markReadStep, shouldMarkSeen } from '@/lib/desk/thread-format';
import type { ConversationBrief } from '@/lib/desk/types';

interface DeskThreadProps {
    thread: TicketThread;
    conversation: ConversationBrief;
    /** detail.ticket.last_inbound_at: what the seen-token will be set to. */
    lastInboundAt: string | null;
    /** lastIncomingAt(thread.messages, lastInboundAt): the 24-hour session. */
    lastIncomingTimestamp: string | null;
    /** The Chat tab is shown. */
    visible: boolean;
    seen: string | null;
    onSeen: () => void;
}

/** The thread bar and scroll area. TicketCentreBody wraps it, with the composer, in the single WACRM theme shell. */
export function DeskThread({
    thread, conversation, lastInboundAt, lastIncomingTimestamp, visible, seen, onSeen,
}: DeskThreadProps) {
    const { scrollRef, atBottom, showNewPill, onScroll, scrollToBottom, keepPositionForOlder } = useThreadScroll(thread.messages);
    const call = useDeskVoiceCall(thread.refresh);
    const markRead = useMarkConversationRead();
    const markedRef = useRef<string | null | undefined>(undefined);

    useEffect(() => {
        // A hidden tab (display: none) may lose its scroll offset: snap back when it is shown again.
        const element = scrollRef.current;
        if (visible && atBottom && element !== null) element.scrollTop = element.scrollHeight;
    }, [visible, atBottom, scrollRef]);

    useEffect(() => {
        if (visible && atBottom && shouldMarkSeen(thread.messages, lastInboundAt, seen)) onSeen();
    }, [visible, atBottom, thread.messages, lastInboundAt, seen, onSeen]);

    useEffect(() => {
        if (!visible || !atBottom) return;
        const step = markReadStep(markedRef.current, thread.messages, conversation.unread_count);
        markedRef.current = step.markedId;
        if (step.patch) markRead(conversation.id);
    }, [visible, atBottom, thread.messages, conversation.unread_count, conversation.id, markRead]);

    const loadOlder = () => {
        keepPositionForOlder();
        thread.loadOlder();
    };
    const startCall = () => {
        if (!window.confirm(`Start a WhatsApp voice call to +${conversation.contact.phone}?`)) return;
        call.mutate({
            phone: conversation.contact.phone,
            integratedNumber: conversation.integrated_number,
            conversationId: conversation.id,
        });
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
                {lastIncomingTimestamp !== null ? (
                    <SessionTimer lastIncomingTimestamp={lastIncomingTimestamp} className="w-3.5 h-3.5 flex-shrink-0" />
                ) : null}
                <span className="truncate text-xs text-slate-500">+{conversation.contact.phone}</span>
                <span className="flex-1" />
                <Button variant="outline" size="sm" className="text-xs h-8" disabled={call.isPending} onClick={startCall} title="WhatsApp voice call">
                    <Phone className={`w-3.5 h-3.5 ${call.isPending ? 'animate-pulse' : ''}`} />
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={thread.refresh} title="Refresh conversation">
                    <RefreshCw className="w-3.5 h-3.5" />
                </Button>
            </div>
            <div className="relative flex min-h-0 flex-1 flex-col">
                <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {thread.messages.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-500">No messages yet.</p>
                    ) : (
                        <MessageThread
                            messages={thread.messages}
                            loadingOlder={thread.loadingOlder}
                            onLoadOlder={thread.hasOlder ? loadOlder : undefined}
                        />
                    )}
                </div>
                {showNewPill ? (
                    <button
                        type="button"
                        onClick={scrollToBottom}
                        className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#7c3aed] px-3 py-1 text-xs font-medium text-[#ffffff] shadow"
                    >
                        New messages ↓
                    </button>
                ) : null}
            </div>
        </div>
    );
}
