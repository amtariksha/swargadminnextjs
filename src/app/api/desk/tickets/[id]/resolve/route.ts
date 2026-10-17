import { ticketParams, ticketResolveBody } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, readJsonBody } from '@/lib/desk/api-error';
import { resolveTicket } from '@/lib/desk/api/ticket-resolve';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export const POST = withDesk<Params>('agent', async (request, ctx, route) => {
    const { id } = parseOrThrow(ticketParams, await route.params);
    const body = parseOrThrow(ticketResolveBody, await readJsonBody(request));
    return deskOk(await resolveTicket(id, body, ctx));
});
