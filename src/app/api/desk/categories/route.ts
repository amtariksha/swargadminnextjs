import { categoriesPutBody, categoriesQuery } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, queryObject, readJsonBody } from '@/lib/desk/api-error';
import { putCategories, readCategories } from '@/lib/desk/api/categories';

export const dynamic = 'force-dynamic';

export const GET = withDesk('agent', async (request, ctx) => {
    const query = parseOrThrow(categoriesQuery, queryObject(request));
    return deskOk({ items: await readCategories(query, ctx) });
}, { alwaysOn: true });

export const PUT = withDesk('manager', async (request) => {
    const body = parseOrThrow(categoriesPutBody, await readJsonBody(request));
    return deskOk({ items: await putCategories(body) });
}, { alwaysOn: true });
