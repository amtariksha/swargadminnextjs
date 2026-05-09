import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── POST /api/ctwa/disconnect ───────────────────────────────
// Disconnect Facebook account and clear CTWA config
export async function POST(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);

    const { error } = await supabaseAdmin
        .from("ctwa_config")
        .delete()
        .eq("org_id", orgId);

    if (error) {
        console.error("[CTWA Disconnect] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
