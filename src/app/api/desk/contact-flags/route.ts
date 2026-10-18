// Routes 21 to 23 (unit P1e): GET agent (removed rows manager only), POST and PATCH manager for both
// kinds (planner decision Q-8). The id of a PATCH is in the body, like action-items.
import { contactFlagCreateBody, contactFlagPatchBody, contactFlagsQuery } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, queryObject, readJsonBody } from '@/lib/desk/api-error';
import { createContactFlag, listContactFlags, patchContactFlag } from '@/lib/desk/api/contact-flags';

export const dynamic = 'force-dynamic';

export const GET = withDesk('agent', async (request, ctx) => {
    const query = parseOrThrow(contactFlagsQuery, queryObject(request));
    return deskOk(await listContactFlags(query, ctx));
});

export const POST = withDesk('manager', async (request, ctx) => {
    const body = parseOrThrow(contactFlagCreateBody, await readJsonBody(request));
    const { response, created } = await createContactFlag(body, ctx);
    return deskOk(response, created ? 201 : 200);
});

export const PATCH = withDesk('manager', async (request, ctx) => {
    const body = parseOrThrow(contactFlagPatchBody, await readJsonBody(request));
    return deskOk(await patchContactFlag(body, ctx));
});
