import { actionItemCreateBody, actionItemPatchBody, actionItemsQuery } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, queryObject, readJsonBody } from '@/lib/desk/api-error';
import { createActionItem, listActionItems, patchActionItem } from '@/lib/desk/api/action-items';

export const dynamic = 'force-dynamic';

export const GET = withDesk('manager', async (request) => {
    const query = parseOrThrow(actionItemsQuery, queryObject(request));
    return deskOk(await listActionItems(query));
});

export const POST = withDesk('manager', async (request, ctx) => {
    const body = parseOrThrow(actionItemCreateBody, await readJsonBody(request));
    return deskOk(await createActionItem(body, ctx), 201);
});

export const PATCH = withDesk('manager', async (request, ctx) => {
    const body = parseOrThrow(actionItemPatchBody, await readJsonBody(request));
    return deskOk(await patchActionItem(body, ctx));
});
