import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── PATCH /api/quick-replies/[id] ──────────────────────────
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.body !== undefined) updateData.body = body.body;
    if (body.shortcut !== undefined) updateData.shortcut = body.shortcut;

    let query = supabaseAdmin
        .from("quick_replies")
        .update(updateData)
        .eq("id", id);

    if (!isSuperAdmin) {
        query = query.eq("org_id", orgId);
    }

    const { data, error } = await query.select().single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        id: data.id,
        title: data.title,
        body: data.body,
        shortcut: data.shortcut || undefined,
        createdAt: data.created_at,
    });
}

// ─── DELETE /api/quick-replies/[id] ─────────────────────────
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { id } = await params;

    let query = supabaseAdmin
        .from("quick_replies")
        .delete()
        .eq("id", id);

    if (!isSuperAdmin) {
        query = query.eq("org_id", orgId);
    }

    const { error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
