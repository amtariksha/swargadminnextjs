import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── PATCH /api/templates/local/[id] ────────────────────────
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId } = getRequestContext(request.headers);
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.language !== undefined) updateData.language = body.language;
    if (body.headerType !== undefined) updateData.header_type = body.headerType;
    if (body.headerContent !== undefined) updateData.header_content = body.headerContent;
    if (body.body !== undefined) updateData.body = body.body;
    if (body.footer !== undefined) updateData.footer = body.footer;
    if (body.buttons !== undefined) updateData.buttons = body.buttons;
    if (body.variableSamples !== undefined) updateData.variable_samples = body.variableSamples;
    if (body.status !== undefined) updateData.status = body.status;

    const { data, error } = await supabaseAdmin
        .from("templates_local")
        .update(updateData)
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        id: data.id,
        name: data.name,
        category: data.category,
        language: data.language,
        body: data.body,
        status: data.status,
    });
}

// ─── DELETE /api/templates/local/[id] ───────────────────────
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId } = getRequestContext(request.headers);
    const { id } = await params;

    const { error } = await supabaseAdmin
        .from("templates_local")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
