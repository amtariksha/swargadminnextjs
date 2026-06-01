import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

// ─── PATCH /api/reminders/[id] ──────────────────────────────
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    // Support both old (is_dismissed) and new (status) patterns
    if (body.is_dismissed !== undefined) {
        updateData.status = body.is_dismissed ? "dismissed" : "active";
    }
    if (body.status) updateData.status = body.status;
    if (body.remind_at || body.due_at) updateData.due_at = body.remind_at || body.due_at;
    if (body.note !== undefined) updateData.note = body.note;

    const { error } = await supabaseAdmin
        .from("reminders")
        .update(updateData)
        .eq("id", id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

// ─── DELETE /api/reminders/[id] ─────────────────────────────
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const { error } = await supabaseAdmin
        .from("reminders")
        .delete()
        .eq("id", id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
