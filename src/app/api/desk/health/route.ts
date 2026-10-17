import { deskOk, withDesk } from '@/lib/desk/authz';
import { readHealth } from '@/lib/desk/api/me';

export const dynamic = 'force-dynamic';

export const GET = withDesk('agent', async () => deskOk(await readHealth()), { alwaysOn: true });
