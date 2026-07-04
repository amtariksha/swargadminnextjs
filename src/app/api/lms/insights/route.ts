/**
 * GET /api/lms/insights — insights feed (Today screen + /lms/insights page)
 *
 * Default (no params) is unchanged: `pending` state, unexpired, priority
 * desc + recency, limit 20 — the Today screen's contract.
 *
 * Additive params for the /lms/insights page:
 *   ?state=pending|approved|snoozed|dismissed|expired|all   (default pending)
 *   ?limit=1..100                                           (default 20)
 * Non-pending states skip the expiry filter (an approved digest from last
 * week is still worth reading); `all` also skips the state filter.
 */

import { NextRequest, NextResponse } from "next/server";
import { lmsAdmin } from "@/lib/lms/supabase";

const STATES = ["pending", "approved", "snoozed", "dismissed", "expired"];

export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const state = sp.get("state") ?? "pending";
    const rawLimit = Number.parseInt(sp.get("limit") ?? "20", 10);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 20 : rawLimit, 1), 100);

    try {
        let query = lmsAdmin.from("lms_insights_feed").select("*");
        if (state !== "all") {
            if (!STATES.includes(state)) {
                return NextResponse.json({ error: `unknown state: ${state}` }, { status: 400 });
            }
            query = query.eq("state", state);
        }
        if (state === "pending") {
            query = query.gt("expires_at", new Date().toISOString());
        }
        const { data, error } = await query
            .order("priority", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(limit);
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
