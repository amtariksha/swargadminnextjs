import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import type { WhatsAppNumber } from "@/lib/whatsapp/types";

/**
 * GET /api/numbers
 * Fetch configured numbers from the database.
 */
export async function GET(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    try {
        let query = supabaseAdmin
            .from("integrated_numbers")
            .select("*")
            .order("created_at", { ascending: true });

        // Super admins see all numbers; regular users see only their org
        if (!isSuperAdmin) {
            query = query.eq("org_id", orgId);
        }

        const { data: dbNumbers, error } = await query;

        if (error) {
            console.error("Error fetching integrated_numbers from DB:", error);
            return NextResponse.json({ error: "Failed to fetch numbers" }, { status: 500 });
        }

        let numbers: WhatsAppNumber[] = [];

        if (dbNumbers && dbNumbers.length > 0) {
            numbers = dbNumbers.map((dbNum, index) => ({
                id: dbNum.id,
                number: dbNum.number,
                label: dbNum.label || `Number ${index + 1}`,
                isDefault: index === 0, // First number is default
                provider: dbNum.provider,
                metaWabaId: dbNum.meta_waba_id,
                metaPhoneNumberId: dbNum.meta_phone_number_id,
                metaAccessToken: dbNum.meta_access_token,
                orgId: dbNum.org_id,
            }));
        }

        return NextResponse.json(numbers);
    } catch (err) {
        console.error("API error /api/numbers:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * POST /api/numbers
 * Add a new integrated number.
 */
export async function POST(req: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(req.headers);
    try {
        const body = await req.json();
        const { number, label, provider, metaWabaId, metaPhoneNumberId, metaAccessToken, orgId: targetOrgId } = body;

        if (!number) {
            return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
        }

        const cleanNumber = number.replace(/^\+/, "");

        // Super admins can specify the target org; regular users always use their own org
        const effectiveOrgId = isSuperAdmin && targetOrgId ? targetOrgId : orgId;

        const { data, error } = await supabaseAdmin
            .from("integrated_numbers")
            .insert([{
                org_id: effectiveOrgId,
                number: cleanNumber,
                label,
                provider: provider || "msg91",
                meta_waba_id: metaWabaId,
                meta_phone_number_id: metaPhoneNumberId,
                meta_access_token: metaAccessToken,
            }])
            .select()
            .single();

        if (error) {
            console.error("Error adding integrated_number:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (err) {
        console.error("POST /api/numbers error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * PATCH /api/numbers
 * Update an integrated number.
 */
export async function PATCH(req: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(req.headers);
    try {
        const body = await req.json();
        const { id, label, provider, metaWabaId, metaPhoneNumberId, metaAccessToken, orgId: newOrgId } = body;

        if (!id) {
            return NextResponse.json({ error: "Number ID is required" }, { status: 400 });
        }

        const updateData: Record<string, unknown> = {
            label,
            provider,
            meta_waba_id: metaWabaId,
            meta_phone_number_id: metaPhoneNumberId,
            meta_access_token: metaAccessToken,
        };

        // Super admins can reassign a number to a different org
        if (isSuperAdmin && newOrgId) {
            updateData.org_id = newOrgId;
        }

        let query = supabaseAdmin
            .from("integrated_numbers")
            .update(updateData)
            .eq("id", id);

        // Regular users can only update their own org's numbers
        if (!isSuperAdmin) {
            query = query.eq("org_id", orgId);
        }

        const { data, error } = await query.select().single();

        if (error) {
            console.error("Error updating integrated_number:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (err) {
        console.error("PATCH /api/numbers error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * DELETE /api/numbers
 * Delete an integrated number.
 */
export async function DELETE(req: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(req.headers);
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "Number ID is required" }, { status: 400 });
        }

        let query = supabaseAdmin
            .from("integrated_numbers")
            .delete()
            .eq("id", id);

        // Regular users can only delete their own org's numbers
        if (!isSuperAdmin) {
            query = query.eq("org_id", orgId);
        }

        const { error, count } = await query.select().then(res => ({
            error: res.error,
            count: res.data?.length ?? 0,
        }));

        if (error) {
            console.error("Error deleting integrated_number:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (count === 0) {
            return NextResponse.json({ error: "Number not found or access denied" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("DELETE /api/numbers error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
