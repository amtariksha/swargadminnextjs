import { ticketParams, ticketPatchBody } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, readJsonBody } from '@/lib/desk/api-error';
import { getTicketDetail } from '@/lib/desk/api/ticket-detail';
import { patchTicket } from '@/lib/desk/api/ticket-patch';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export const GET = withDesk<Params>('agent', async (_request, ctx, route) => {
    const { id } = parseOrThrow(ticketParams, await route.params);
    return deskOk(await getTicketDetail(id, ctx));
});

export const PATCH = withDesk<Params>('agent', async (request, ctx, route) => {
    const { id } = parseOrThrow(ticketParams, await route.params);
    const body = parseOrThrow(ticketPatchBody, await readJsonBody(request));
    return deskOk(await patchTicket(id, body, ctx));
});
