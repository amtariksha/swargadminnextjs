'use client';

import { useMemo } from 'react';
import { MessageComposer } from '@/components/whatsapp/inbox/message-composer';
import { toComposerConversation } from '@/lib/desk/thread-format';
import type { ConversationBrief } from '@/lib/desk/types';
import type { Message } from '@/lib/whatsapp/types';

interface DeskComposerProps {
    conversation: ConversationBrief;
    lastIncomingTimestamp: string | null;
    onSent: (message: Message) => void;
}

/** The old inbox's composer fed from the ticket's conversation; it sends from the stored number. */
export function DeskComposer({ conversation, lastIncomingTimestamp, onSent }: DeskComposerProps) {
    const composerConversation = useMemo(
        () => toComposerConversation(conversation, lastIncomingTimestamp),
        [conversation, lastIncomingTimestamp],
    );
    return (
        <MessageComposer
            conversation={composerConversation}
            sendFromNumber={conversation.integrated_number}
            onSent={onSent}
        />
    );
}
