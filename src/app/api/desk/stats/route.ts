import { deskFail, deskOk, withDesk } from '@/lib/desk/authz';
import { queryObject } from '@/lib/desk/api-error';
import { epochOf, validateStatsQuery } from '@/lib/desk/stats-helpers';
import { readStatsInput } from '@/lib/desk/stats-read';
import { buildDeskStats, emptyDeskStats } from '@/lib/desk/stats-report';
import type { DeskStats } from '@/lib/desk/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const GET = withDesk('manager', async (request, ctx) => {
    const query = validateStatsQuery(queryObject(request));
    if (!query.ok) return deskFail(query.code, query.message);
    const now = new Date();
    if (epochOf(ctx.settings) === null) return deskOk<DeskStats>(emptyDeskStats(query.range, now));
    const read = await readStatsInput(query.range, ctx, now);
    if (!read.ok) return deskFail(read.code, read.message);
    return deskOk<DeskStats>(buildDeskStats(read.value));
});
