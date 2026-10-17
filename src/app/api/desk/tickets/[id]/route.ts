import { ticketParams } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow } from '@/lib/desk/api-error';
import { getTicketDetail } from '@/lib/desk/api/ticket-detail';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export const GET = withDesk<Params>('agent', async (_request, ctx, route) => {
    const { id } = parseOrThrow(ticketParams, await route.params);
    return deskOk(await getTicketDetail(id, ctx));
});
