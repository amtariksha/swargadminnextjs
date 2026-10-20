import { ticketMessagesQuery, ticketParams } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, queryObject } from '@/lib/desk/api-error';
import { listTicketMessages } from '@/lib/desk/api/ticket-messages';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export const GET = withDesk<Params>('agent', async (request, ctx, route) => {
    const { id } = parseOrThrow(ticketParams, await route.params);
    const query = parseOrThrow(ticketMessagesQuery, queryObject(request));
    return deskOk(await listTicketMessages(id, query, ctx));
});
