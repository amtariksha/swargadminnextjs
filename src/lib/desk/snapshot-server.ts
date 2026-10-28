// Server-side customer snapshot for the actions route (tomorrow rule and the expected customer, decision Q-1).
// Never throws: any failure is null, and the caller treats null as "the check could not run".
import { deskBackendPost } from './backend';
import { parseSnapshotEnvelope } from './snapshot-schema';
import type { CustomerSnapshot } from './types';

export async function fetchSnapshotForTicket(token: string, phone: string, userId?: number): Promise<CustomerSnapshot | null> {
    const body = userId === undefined ? { phone } : { phone, user_id: userId };
    try {
        const response = await deskBackendPost('/support/customer-snapshot', token, body);
        if (response.status !== 200) {
            console.warn('[desk-api] snapshot unavailable', response.status);
            return null;
        }
        return parseSnapshotEnvelope(await response.json());
    } catch (error) {
        console.warn('[desk-api] snapshot unavailable', error instanceof Error ? error.name : 'Error');
        return null;
    }
}
