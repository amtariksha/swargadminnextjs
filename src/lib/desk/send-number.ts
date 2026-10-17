// Which business number a chat send goes out from. Desk's queue spans both numbers, so a send
// must use the number the conversation lives on, not the one the browser's store put in the
// request body. A stored value that is the legacy literal "default", or that is not an active
// number, falls back to the body value, which is exactly today's behaviour. Matching is by the
// full digit string only: a wrong tail match would send from the wrong number, while a missed
// match merely keeps today's behaviour.

export interface SendNumberInput {
    /** conversations.integrated_number of the conversation named by conversationId; null when the request has none or the row was not found. */
    conversationNumber: string | null | undefined;
    /** The integratedNumber field of the request body. */
    bodyNumber: string | null | undefined;
    /** integrated_numbers.number of every row with active = true. */
    activeNumbers: readonly string[] | null | undefined;
}

export type SendNumberSource = 'conversation' | 'body' | 'none';

export interface SendNumberResult {
    /** The value the route uses as its sending number; null = the route applies its existing fallback. */
    number: string | null;
    source: SendNumberSource;
    /** true when the conversation's number was used and the body named a different number. */
    overridden: boolean;
}

function digitsOf(value: string | null | undefined): string {
    return String(value ?? '').replace(/\D/g, '');
}

export function resolveSendNumber(input: SendNumberInput): SendNumberResult {
    const active = Array.isArray(input.activeNumbers) ? input.activeNumbers : [];
    const conversationDigits = digitsOf(input.conversationNumber);
    if (conversationDigits.length > 0) {
        const stored = active.find((number) => typeof number === 'string' && digitsOf(number) === conversationDigits);
        if (stored !== undefined) {
            const bodyDigits = digitsOf(input.bodyNumber);
            return {
                number: stored,
                source: 'conversation',
                overridden: bodyDigits.length > 0 && bodyDigits !== conversationDigits,
            };
        }
    }
    const body = String(input.bodyNumber ?? '').trim();
    if (body.length > 0) return { number: body, source: 'body', overridden: false };
    return { number: null, source: 'none', overridden: false };
}
