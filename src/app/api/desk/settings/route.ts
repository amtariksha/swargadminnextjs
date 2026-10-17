import { settingsPutBody } from '@/lib/desk/contracts';
import { deskOk, withDesk } from '@/lib/desk/authz';
import { parseOrThrow, readJsonBody } from '@/lib/desk/api-error';
import { readSettingsResponse, writeSettings } from '@/lib/desk/api/settings-write';

export const dynamic = 'force-dynamic';

export const GET = withDesk('manager', async () => deskOk(await readSettingsResponse()), { alwaysOn: true });

export const PUT = withDesk('manager', async (request) => {
    const body = parseOrThrow(settingsPutBody, await readJsonBody(request));
    return deskOk(await writeSettings(body));
}, { alwaysOn: true });
