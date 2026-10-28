import { ticketActionBody, ticketParams } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, readJsonBody } from '@/lib/desk/api-error';
import { recordTicketAction } from '@/lib/desk/api/ticket-actions';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export const POST = withDesk<Params>('agent', async (request, ctx, route) => {
    const { id } = parseOrThrow(ticketParams, await route.params);
    const body = parseOrThrow(ticketActionBody, await readJsonBody(request));
    return deskOk(await recordTicketAction(id, body, ctx));
});
