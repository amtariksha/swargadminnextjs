// The one backend call of the stats and review reads: delivery counts, the denominator of every
// "per 1,000 deliveries" rate. Never throws; any failure is null and the rates show as unavailable.

import { z } from 'zod';
import { backendEnvelope } from './contracts';
import { deskBackendGet } from './backend';
import type { DeliveryCounts } from './stats-report';

const count = z.coerce.number();
const dayCounts = { stops: count, delivered_stops: count, not_delivered_stops: count, delivered_qty: count };
const deliveryCountsData = z.object({
    from: z.string(),
    to: z.string(),
    total: z.object(dayCounts),
    by_day: z.array(z.object({ day: z.string(), ...dayCounts })),
    by_driver: z.array(z.object({ driver_id: count, driver_name: z.string().nullable(), ...dayCounts })),
    by_product: z.array(z.object({ product_id: count, product_title: z.string().nullable(), delivered_qty: count })),
});

/** null for a network error, a timeout, any non-200 status (404 until P2b ships) or an unreadable body. */
export async function fetchDeliveryCounts(token: string, from: string, to: string): Promise<DeliveryCounts | null> {
    try {
        const response = await deskBackendGet(`/support/delivery-counts?from=${from}&to=${to}`, token);
        if (response.status !== 200) return null;
        const parsed = backendEnvelope(deliveryCountsData).safeParse(await response.json());
        return parsed.success && parsed.data.response === 200 ? parsed.data.data : null;
    } catch {
        return null;
    }
}
