import { reviewQuery } from '@/lib/desk/contracts';
import { deskFail, deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, queryObject } from '@/lib/desk/api-error';
import { istToday } from '@/lib/desk/business-hours';
import { readReviewInput } from '@/lib/desk/review-read';
import { buildDeskReview } from '@/lib/desk/review-report';
import type { DeskReview } from '@/lib/desk/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const GET = withDesk('manager', async (request, ctx) => {
    const query = parseOrThrow(reviewQuery, queryObject(request));
    const now = new Date();
    const read = await readReviewInput(query.date ?? istToday(now), ctx, now);
    if (!read.ok) return deskFail(read.code, read.message);
    return deskOk<DeskReview>(buildDeskReview(read.value));
});
