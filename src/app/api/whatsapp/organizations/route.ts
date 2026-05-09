import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

// GET /api/organizations — List all organizations (super_admin only)
export async function GET(request: NextRequest) {
    const { isSuperAdmin } = getRequestContext(request.headers);
    if (!isSuperAdmin) {
        return NextResponse.json({ error: "Super admin access required" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
        .from("organizations")
        .select("id, name, slug, created_at, updated_at")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Organizations fetch error:", error);
        return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(data || []);
}

// POST /api/organizations — Create new organization (super_admin only)
export async function POST(request: NextRequest) {
    const { isSuperAdmin } = getRequestContext(request.headers);
    if (!isSuperAdmin) {
        return NextResponse.json({ error: "Super admin access required" }, { status: 403 });
    }

    const { name, slug } = await request.json();

    if (!name || !slug) {
        return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
        return NextResponse.json({ error: "Slug must contain only lowercase letters, numbers, and hyphens" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("organizations")
        .insert({ name, slug })
        .select("id, name, slug, created_at, updated_at")
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json({ error: "An organization with this slug already exists" }, { status: 409 });
        }
        console.error("Organization create error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}
