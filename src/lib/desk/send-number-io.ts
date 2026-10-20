// Server only. Blueprint §6: with a conversationId a chat send goes out from the number the
// conversation is stored on, not from the number the browser put in the body. Used by chat/send,
// chat/call, chat/wa-payment and payments. Never throws: no match or any read error → null, and the
// route keeps today's behaviour (the body value).
import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import { resolveSendNumber } from './send-number';

export interface StoredSendNumberInput {
    conversationId: unknown;
    bodyNumber: unknown;
    /** Log prefix of the calling route: 'Chat Send', 'Voice Call', 'WA Payment', 'Payments'. */
    tag: string;
}

export async function storedSendNumber({ conversationId, bodyNumber, tag }: StoredSendNumberInput): Promise<string | null> {
    if (typeof conversationId !== 'string' || conversationId === '') return null;
    try {
        const [conversationRead, numbersRead] = await Promise.all([
            supabaseAdmin.from('conversations').select('integrated_number').eq('id', conversationId).limit(1).maybeSingle(),
            supabaseAdmin.from('integrated_numbers').select('number').eq('active', true),
        ]);
        const picked = resolveSendNumber({
            conversationNumber: (conversationRead.data as { integrated_number?: string | null } | null)?.integrated_number ?? null,
            bodyNumber: typeof bodyNumber === 'string' ? bodyNumber : null,
            activeNumbers: ((numbersRead.data ?? []) as Array<{ number: string }>).map((row) => row.number),
        });
        if (picked.overridden) console.warn(`[${tag}] sending number taken from conversation ${conversationId}`);
        return picked.source === 'conversation' ? picked.number : null;
    } catch (error) {
        console.warn(`[${tag}] stored-number lookup failed; using the request number`, error instanceof Error ? error.name : 'Error');
        return null;
    }
}
