import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

// GET /api/organizations/[id] — Get single org
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { isSuperAdmin } = getRequestContext(request.headers);
    if (!isSuperAdmin) {
        return NextResponse.json({ error: "Super admin access required" }, { status: 403 });
    }

    const { id } = await params;

    const { data, error } = await supabaseAdmin
        .from("organizations")
        .select("id, name, slug, created_at, updated_at")
        .eq("id", id)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json(data);
}

// PATCH /api/organizations/[id] — Update org
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { isSuperAdmin } = getRequestContext(request.headers);
    if (!isSuperAdmin) {
        return NextResponse.json({ error: "Super admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name) updates.name = body.name;
    if (body.slug) {
        if (!/^[a-z0-9-]+$/.test(body.slug)) {
            return NextResponse.json({ error: "Slug must contain only lowercase letters, numbers, and hyphens" }, { status: 400 });
        }
        updates.slug = body.slug;
    }

    const { data, error } = await supabaseAdmin
        .from("organizations")
        .update(updates)
        .eq("id", id)
        .select("id, name, slug, created_at, updated_at")
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
        }
        console.error("Organization update error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// DELETE /api/organizations/[id] — Delete org
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { isSuperAdmin } = getRequestContext(request.headers);
    if (!isSuperAdmin) {
        return NextResponse.json({ error: "Super admin access required" }, { status: 403 });
    }

    const { id } = await params;

    // Prevent deletion of default org
    if (id === "00000000-0000-0000-0000-000000000001") {
        return NextResponse.json({ error: "Cannot delete the default organization" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from("organizations")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Organization delete error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
