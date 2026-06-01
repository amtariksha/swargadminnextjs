/**
 * POST /api/lms/rfm/recompute
 *
 * Kicks off a real RFM + Health-score compute against the org's contacts +
 * the backend orders endpoint. Synchronous — completes in one request.
 * Admin-gated by middleware.
 *
 * For first-time setup without real order data, see /api/lms/rfm/seed-demo.
 *
 * Body is empty; orgId comes from middleware headers. The admin's Bearer
 * JWT is extracted from the Authorization header and forwarded to backend.
 */

import { NextRequest, NextResponse } from "next/server";
import { runRfmRecompute } from "@/lib/lms/rfm/runner";

export const maxDuration = 60; // up to 1 minute on Vercel

export async function POST(request: NextRequest) {
    const auth = request.headers.get("authorization") ?? "";
    const authToken = auth.startsWith("Bearer ")
        ? auth.slice("Bearer ".length)
        : undefined;

    try {
        const result = await runRfmRecompute({ authToken });
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/lms/rfm/recompute]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
