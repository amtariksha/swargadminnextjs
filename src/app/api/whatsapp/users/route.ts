import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { hashPassword } from "@/lib/whatsapp/auth";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── GET /api/users — List all users (admin only) ─────────
export async function GET(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);

    const role = request.headers.get("x-user-role");
    if (role !== "admin" && !isSuperAdmin) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    let query = supabaseAdmin
        .from("users")
        .select("id, name, email, role, org_id, is_active, created_at")
        .order("created_at", { ascending: true });

    // Super admins can see all users; regular admins see only their org
    if (!isSuperAdmin) {
        query = query.eq("org_id", orgId);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Users fetch error:", error);
        return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(data || []);
}

// ─── POST /api/users — Create new user (admin only) ───────
export async function POST(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);

    const role = request.headers.get("x-user-role");
    if (role !== "admin" && !isSuperAdmin) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { name, email, password, userRole, org_id: targetOrgId } = await request.json();

    if (!name || !email || !password) {
        return NextResponse.json(
            { error: "Name, email, and password are required" },
            { status: 400 }
        );
    }

    // Super admins can specify the target org; regular admins always use their own org
    const effectiveOrgId = isSuperAdmin && targetOrgId ? targetOrgId : orgId;

    // Check duplicate email
    const { data: existing } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .single();

    if (existing) {
        return NextResponse.json(
            { error: "A user with this email already exists" },
            { status: 409 }
        );
    }

    const passwordHash = await hashPassword(password);

    const { data: user, error } = await supabaseAdmin
        .from("users")
        .insert({
            org_id: effectiveOrgId,
            name,
            email: email.toLowerCase().trim(),
            password_hash: passwordHash,
            role: userRole || "agent",
            is_active: true,
        })
        .select("id, name, email, role, org_id, is_active, created_at")
        .single();

    if (error) {
        console.error("User create error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(user, { status: 201 });
}
