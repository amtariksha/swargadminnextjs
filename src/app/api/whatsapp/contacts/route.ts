import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

function mapContact(row: Record<string, unknown>) {
    return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email || undefined,
        tags: row.tags || [],
        customFields: row.custom_fields || {},
        createdAt: row.created_at,
    };
}

// ─── GET /api/contacts ─────────────────────────────────────
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
        .from("contacts")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

    if (search) {
        query = query.or(
            `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
        );
    }

    const { data, error, count } = await query;

    if (error) {
        console.error("Contacts fetch error:", error);
        return NextResponse.json({ contacts: [], total: 0, page, limit });
    }

    return NextResponse.json({
        contacts: (data || []).map(mapContact),
        total: count || 0,
        page,
        limit,
    });
}

// ─── POST /api/contacts ────────────────────────────────────
export async function POST(request: NextRequest) {
    const body = await request.json();

    const { data, error } = await supabaseAdmin
        .from("contacts")
        .insert({
            name: body.name || "Unknown",
            phone: body.phone,
            email: body.email || null,
            tags: body.tags || [],
        })
        .select()
        .single();

    if (error) {
        console.error("Create contact error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(mapContact(data), { status: 201 });
}
