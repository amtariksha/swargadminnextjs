import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── GET /api/ctwa/config ────────────────────────────────────
// Returns the current CTWA configuration (Facebook connection status)
export async function GET(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);

    let query = supabaseAdmin
        .from("ctwa_config")
        .select("*");

    if (!isSuperAdmin) {
        query = query.eq("org_id", orgId);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
        console.error("[CTWA Config] Fetch error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
        return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
        connected: true,
        id: data.id,
        facebookUserId: data.facebook_user_id,
        facebookName: data.facebook_name,
        adAccountId: data.ad_account_id,
        adAccountName: data.ad_account_name,
        datasetId: data.dataset_id,
        capiEnabled: data.capi_enabled,
        capiLeadTag: data.capi_lead_tag,
        capiPurchaseTag: data.capi_purchase_tag,
        connectedAt: data.connected_at,
    });
}

// ─── PUT /api/ctwa/config ────────────────────────────────────
// Update CTWA configuration (ad account, CAPI settings)
export async function PUT(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const body = await request.json();

    // Get existing config
    let existQuery = supabaseAdmin
        .from("ctwa_config")
        .select("id");

    if (!isSuperAdmin) {
        existQuery = existQuery.eq("org_id", orgId);
    }

    const { data: existing } = await existQuery.limit(1).maybeSingle();

    if (!existing) {
        return NextResponse.json(
            { error: "Not connected to Facebook. Connect first." },
            { status: 400 }
        );
    }

    const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };

    if (body.adAccountId !== undefined) updateData.ad_account_id = body.adAccountId;
    if (body.adAccountName !== undefined) updateData.ad_account_name = body.adAccountName;
    if (body.datasetId !== undefined) updateData.dataset_id = body.datasetId;
    if (body.capiEnabled !== undefined) updateData.capi_enabled = body.capiEnabled;
    if (body.capiLeadTag !== undefined) updateData.capi_lead_tag = body.capiLeadTag;
    if (body.capiPurchaseTag !== undefined) updateData.capi_purchase_tag = body.capiPurchaseTag;

    const { error } = await supabaseAdmin
        .from("ctwa_config")
        .update(updateData)
        .eq("id", existing.id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
