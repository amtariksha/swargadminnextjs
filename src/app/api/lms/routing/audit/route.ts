/**
 * GET /api/lms/routing/audit?limit=...&purpose=...
 *
 * Returns the most recent N entries from lms_routing_audit for the org.
 * Used by the WhatsApp Channels settings page so operators can verify
 * that the 2-number routing rule is being honoured in production.
 */

import { NextRequest, NextResponse } from "next/server";
import { lmsAdmin } from "@/lib/lms/supabase";

export async function GET(request: NextRequest) {
    const sp = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "100", 10), 1), 500);
    const purpose = sp.get("purpose");

    try {
        let q = lmsAdmin
            .from("lms_routing_audit")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .limit(limit);
        if (purpose) q = q.eq("purpose", purpose);
        const { data, error, count } = await q;
        if (error) throw new Error(error.message);

        // Quick per-number tally for the summary header.
        let n1 = 0;
        let n2 = 0;
        let rejected = 0;
        for (const row of data ?? []) {
            if (row.rejected) rejected += 1;
            if (row.picked_number === "1") n1 += 1;
            else if (row.picked_number === "2") n2 += 1;
        }
        return NextResponse.json({
            count: data?.length ?? 0,
            total: count ?? 0,
            summary: { number1Count: n1, number2Count: n2, rejectedCount: rejected },
            entries: data ?? [],
        });
    } catch (err) {
        console.error("[GET /api/lms/routing/audit]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
