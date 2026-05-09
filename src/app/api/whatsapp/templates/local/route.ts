import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── GET /api/templates/local ───────────────────────────────
export async function GET(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { searchParams } = request.nextUrl;

    // Super admin can filter by a specific org via ?orgId=...
    const targetOrgId = isSuperAdmin && searchParams.get("orgId")
        ? searchParams.get("orgId")!
        : orgId;

    let query = supabaseAdmin
        .from("templates_local")
        .select("*")
        .order("created_at", { ascending: false });

    // Always scope to an org
    if (targetOrgId) {
        query = query.eq("org_id", targetOrgId);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Fetch local templates error:", error);
        return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(
        (data || []).map((t: Record<string, unknown>) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            language: t.language,
            headerType: t.header_type || undefined,
            headerContent: t.header_content || undefined,
            body: t.body,
            footer: t.footer || undefined,
            buttons: t.buttons || undefined,
            variableSamples: t.variable_samples || undefined,
            status: t.status,
            msg91TemplateId: t.msg91_template_id || undefined,
            createdAt: t.created_at,
            updatedAt: t.updated_at,
        }))
    );
}

// ─── POST /api/templates/local ──────────────────────────────
export async function POST(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const body = await request.json();

    const effectiveOrgId = isSuperAdmin && body.orgId ? body.orgId : orgId;

    const { data, error } = await supabaseAdmin
        .from("templates_local")
        .insert({
            org_id: effectiveOrgId,
            name: body.name,
            category: body.category || "MARKETING",
            language: body.language || "en",
            header_type: body.headerType || null,
            header_content: body.headerContent || null,
            body: body.body,
            footer: body.footer || null,
            buttons: body.buttons || null,
            variable_samples: body.variableSamples || null,
            status: "draft",
        })
        .select()
        .single();

    if (error) {
        console.error("Create local template error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
        {
            id: data.id,
            name: data.name,
            category: data.category,
            language: data.language,
            body: data.body,
            status: data.status,
            createdAt: data.created_at,
        },
        { status: 201 }
    );
}
