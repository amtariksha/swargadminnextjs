import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

// ─── GET /api/quick-replies ─────────────────────────────────
export async function GET() {
    const query = supabaseAdmin
        .from("quick_replies")
        .select("*")
        .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
        console.error("Fetch quick replies error:", error);
        return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(
        (data || []).map((qr: Record<string, unknown>) => ({
            id: qr.id,
            title: qr.title,
            body: qr.body,
            shortcut: qr.shortcut || undefined,
            orgId: qr.org_id || undefined,
            createdBy: qr.created_by || undefined,
            createdAt: qr.created_at,
        }))
    );
}

// ─── POST /api/quick-replies ────────────────────────────────
export async function POST(request: NextRequest) {
    const body = await request.json();

    const { data, error } = await supabaseAdmin
        .from("quick_replies")
        .insert({
            title: body.title,
            body: body.body,
            shortcut: body.shortcut || null,
        })
        .select()
        .single();

    if (error) {
        console.error("Create quick reply error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
        {
            id: data.id,
            title: data.title,
            body: data.body,
            shortcut: data.shortcut || undefined,
            createdAt: data.created_at,
        },
        { status: 201 }
    );
}
