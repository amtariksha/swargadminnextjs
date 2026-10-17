import { deskOk, withDesk } from '@/lib/desk/authz';
import { buildMe } from '@/lib/desk/api/me';

export const dynamic = 'force-dynamic';

export const GET = withDesk('agent', async (_request, ctx) => deskOk(buildMe(ctx, new Date())), { alwaysOn: true });
