// Route 24 (unit P1e): conversations of internal contacts for the Internal lane (agent).
import { internalConversationsQuery } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, queryObject } from '@/lib/desk/api-error';
import { listInternalConversations } from '@/lib/desk/api/contact-flags';

export const dynamic = 'force-dynamic';

export const GET = withDesk('agent', async (request, ctx) => {
    const query = parseOrThrow(internalConversationsQuery, queryObject(request));
    return deskOk(await listInternalConversations(query, ctx));
});
