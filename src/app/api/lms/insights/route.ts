/**
 * GET /api/lms/insights — pending insights feed (Today screen)
 *
 * Returns rows in `pending` state, ordered by priority desc + recency.
 * Expired or actioned entries are filtered out.
 */

import { NextRequest, NextResponse } from "next/server";
import { lmsAdmin } from "@/lib/lms/supabase";

export async function GET(_request: NextRequest) {
    try {
        const { data, error } = await lmsAdmin
            .from("lms_insights_feed")
            .select("*")
            .eq("state", "pending")
            .gt("expires_at", new Date().toISOString())
            .order("priority", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(20);
        if (error) throw new Error(error.message);
        return NextResponse.json({ count: data?.length ?? 0, insights: data ?? [] });
    } catch (err) {
        console.error("[GET /api/lms/insights]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
