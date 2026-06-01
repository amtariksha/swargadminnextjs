/**
 * GET /api/lms/consent/audit/[customerId]
 *
 * Returns the FULL consent history (every grant, every withdrawal, every
 * source change) for one customer, newest first. Used by:
 *   - The operator's per-customer Preference Center / consent timeline.
 *   - DSAR access-request fulfilment (data export). The full audit trail
 *     is part of what we're legally required to provide to the data
 *     principal under DPDP Act §11.
 *
 * Auth: admin Bearer JWT (verified by middleware). For DSAR exports
 * generated programmatically, the future /api/lms/dsar/[id]/fulfil route
 * will call this service internally with the same orgId scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConsentHistory } from "@/lib/lms/consent/service";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ customerId: string }> },
) {
    const { customerId } = await params;

    try {
        const history = await getConsentHistory({ customerId });
        return NextResponse.json({ customerId, count: history.length, history });
    } catch (err) {
        console.error("[GET /api/lms/consent/audit/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
