/**
 * GET /api/lms/agent-force/ping
 *
 * Health probe used by the Today screen + /lms/system to show whether
 * Agent Force is reachable. Returns the config status + latency.
 */

import { NextResponse } from "next/server";
import { ping } from "@/lib/lms/agent-force/client";

export async function GET() {
    try {
        const status = await ping();
        return NextResponse.json(status);
    } catch (err) {
        return NextResponse.json(
            {
                configured: false,
                reachable: false,
                error: err instanceof Error ? err.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
