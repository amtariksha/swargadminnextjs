import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { hashPassword } from "@/lib/whatsapp/auth";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── PATCH /api/users/[id] — Update user ──────────────────
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);

    const role = request.headers.get("x-user-role");
    if (role !== "admin" && !isSuperAdmin) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email.toLowerCase().trim();
    if (body.role !== undefined) updates.role = body.role;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.password) {
        updates.password_hash = await hashPassword(body.password);
    }

    let query = supabaseAdmin
        .from("users")
        .update(updates)
        .eq("id", id);

    // Regular admins can only update users in their own org
    if (!isSuperAdmin) {
        query = query.eq("org_id", orgId);
    }

    const { data, error } = await query
        .select("id, name, email, role, org_id, is_active, created_at")
        .single();

    if (error) {
        console.error("User update error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// ─── DELETE /api/users/[id] — Delete user ─────────────────
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);

    const role = request.headers.get("x-user-role");
    if (role !== "admin" && !isSuperAdmin) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;

    // Prevent deleting yourself
    const currentUserId = request.headers.get("x-user-id");
    if (id === currentUserId) {
        return NextResponse.json(
            { error: "You cannot delete your own account" },
            { status: 400 }
        );
    }

    let deleteQuery = supabaseAdmin.from("users").delete().eq("id", id);

    // Regular admins can only delete users in their own org
    if (!isSuperAdmin) {
        deleteQuery = deleteQuery.eq("org_id", orgId);
    }

    const { error } = await deleteQuery;

    if (error) {
        console.error("User delete error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
