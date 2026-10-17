import { ticketListQuery } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, queryObject } from '@/lib/desk/api-error';
import { listTickets } from '@/lib/desk/api/tickets-read';

export const dynamic = 'force-dynamic';

export const GET = withDesk('agent', async (request, ctx) => {
    const query = parseOrThrow(ticketListQuery, queryObject(request));
    return deskOk(await listTickets(query, ctx));
});
