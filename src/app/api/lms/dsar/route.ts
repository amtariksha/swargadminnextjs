/**
 * GET /api/lms/dsar?status=...
 *
 * List DSAR requests for the current org. Admin-only (middleware-gated).
 * Default sort: sla_deadline ASC so most-urgent-first surfaces at the top
 * of the operator queue.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/whatsapp/request";
import { listDsar } from "@/lib/lms/dsar/service";
import type { DsarStatus } from "@/lib/lms/types";

const STATUSES: (DsarStatus | "all")[] = [
    "all",
    "submitted",
    "verifying_identity",
    "in_progress",
    "fulfilled",
    "rejected",
    "expired",
];

export async function GET(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }
    const statusParam = new URL(request.url).searchParams.get("status") ?? "all";
    const status = (
        STATUSES.includes(statusParam as DsarStatus | "all") ? statusParam : "all"
    ) as DsarStatus | "all";

    try {
        const requests = await listDsar({ orgId, status });
        return NextResponse.json({ count: requests.length, requests });
    } catch (err) {
        console.error("[GET /api/lms/dsar]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
