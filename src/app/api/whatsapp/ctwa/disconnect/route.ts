import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

// ─── POST /api/ctwa/disconnect ───────────────────────────────
// Disconnect Facebook account and clear CTWA config
export async function POST() {
    const { error } = await supabaseAdmin
        .from("ctwa_config")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
        console.error("[CTWA Disconnect] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
