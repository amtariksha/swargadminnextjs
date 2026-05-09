import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { sendConversionEvent } from "@/lib/whatsapp/capi";
import { getRequestContext } from "@/lib/whatsapp/request";

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

// ─── GET /api/contacts/[id] ───────────────────────────────
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { id } = await params;

    let query = supabaseAdmin
        .from("contacts")
        .select("*")
        .eq("id", id);

    if (!isSuperAdmin) {
        query = query.eq("org_id", orgId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json(mapContact(data));
}

// ─── PATCH /api/contacts/[id] ─────────────────────────────
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { id } = await params;
    const body = await request.json();

    // Fetch current tags before update for CAPI diff
    let oldTags: string[] = [];
    if (body.tags) {
        let tagQuery = supabaseAdmin
            .from("contacts")
            .select("tags")
            .eq("id", id);
        if (!isSuperAdmin) tagQuery = tagQuery.eq("org_id", orgId);
        const { data: currentContact } = await tagQuery.single();
        oldTags = (currentContact?.tags as string[]) || [];
    }

    const updateData: Record<string, unknown> = {};
    if (body.tags) updateData.tags = body.tags;
    if (body.name) updateData.name = body.name;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.customFields !== undefined) updateData.custom_fields = body.customFields;

    let updateQuery = supabaseAdmin
        .from("contacts")
        .update(updateData)
        .eq("id", id);

    if (!isSuperAdmin) {
        updateQuery = updateQuery.eq("org_id", orgId);
    }

    const { data, error } = await updateQuery.select().single();

    if (error || !data) {
        return NextResponse.json(
            { error: "Failed to update contact" },
            { status: 500 }
        );
    }

    // ─── CAPI Trigger: Send conversion events on tag changes ───
    if (body.tags) {
        const newTags: string[] = body.tags;
        const addedTags = newTags.filter((t: string) => !oldTags.includes(t));

        if (addedTags.length > 0) {
            // Fire and forget — don't block the response
            triggerCAPIForTags(id, addedTags, orgId).catch((err) => {
                console.error("[CAPI Trigger] Error:", err);
            });
        }
    }

    return NextResponse.json(mapContact(data));
}

/**
 * Check if newly added tags match CAPI lead/purchase tags and send conversion events.
 */
async function triggerCAPIForTags(contactId: string, addedTags: string[], orgId: string) {
    // Fetch CAPI config for this org
    const { data: config } = await supabaseAdmin
        .from("ctwa_config")
        .select("capi_enabled, capi_lead_tag, capi_purchase_tag, dataset_id, access_token")
        .eq("org_id", orgId)
        .limit(1)
        .maybeSingle();

    if (!config || !config.capi_enabled || !config.dataset_id || !config.access_token) {
        return; // CAPI not configured or not enabled
    }

    // Find a CTWA conversation for this contact within the same org (need ctwa_clid)
    const { data: ctwaConv } = await supabaseAdmin
        .from("conversations")
        .select("ctwa_clid")
        .eq("contact_id", contactId)
        .eq("org_id", orgId)
        .not("ctwa_clid", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!ctwaConv?.ctwa_clid) {
        return; // No CTWA conversation for this contact, can't send CAPI event
    }

    for (const tag of addedTags) {
        if (tag === config.capi_lead_tag) {
            const result = await sendConversionEvent(
                { eventName: "Lead", ctwaClid: ctwaConv.ctwa_clid },
                config.dataset_id,
                config.access_token
            );
            console.log(`[CAPI Trigger] Lead event for contact ${contactId}: ${result.success ? "sent" : result.error}`);
        }
        if (tag === config.capi_purchase_tag) {
            const result = await sendConversionEvent(
                { eventName: "Purchase", ctwaClid: ctwaConv.ctwa_clid },
                config.dataset_id,
                config.access_token
            );
            console.log(`[CAPI Trigger] Purchase event for contact ${contactId}: ${result.success ? "sent" : result.error}`);
        }
    }
}
