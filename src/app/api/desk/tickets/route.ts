import { ticketCreateBody, ticketListQuery } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, queryObject, readJsonBody } from '@/lib/desk/api-error';
import { createTicket } from '@/lib/desk/api/ticket-create';
import { listTickets } from '@/lib/desk/api/tickets-read';

export const dynamic = 'force-dynamic';

export const GET = withDesk('agent', async (request, ctx) => {
    const query = parseOrThrow(ticketListQuery, queryObject(request));
    return deskOk(await listTickets(query, ctx));
});

export const POST = withDesk('agent', async (request, ctx) => {
    const body = parseOrThrow(ticketCreateBody, await readJsonBody(request));
    const { response, status } = await createTicket(body, ctx);
    return deskOk(response, status);
});
