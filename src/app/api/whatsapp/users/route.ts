import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

// ─── GET /api/whatsapp/users — read-only list of WACRM agents ─────────────
//
// Authentication is handled by the admin panel's login flow (this route is
// gated by middleware.ts). User CRUD has been removed in favour of the
// admin panel's roles + admin_users management — this endpoint remains as
// a read-only lookup so the Inbox conversation-assignee dropdown
// (chat-window.tsx) keeps working against legacy assignments.
//
// New agents should be onboarded by adding them as admin_users in the admin
// panel; future work will mirror those entries into the Supabase `users`
// table on first authenticated request so assignment can target them.
export async function GET() {
    const query = supabaseAdmin
        .from("users")
        .select("id, name, email, role, org_id, is_active, created_at")
        .order("created_at", { ascending: true });

    const { data, error } = await query;

    if (error) {
        console.error("Users fetch error:", error);
        return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(data || []);
}
