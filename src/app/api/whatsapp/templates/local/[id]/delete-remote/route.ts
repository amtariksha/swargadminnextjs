import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

// ─── DELETE /api/templates/local/[id]/delete-remote ───────────
// Delete a template from MSG91 and remove local record
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId } = getRequestContext(request.headers);
    const { id } = await params;

    const authKey = await getAppSetting("msg91_auth_key", process.env.MSG91_AUTH_KEY || "", orgId);
    if (!authKey) {
        return NextResponse.json(
            { error: "MSG91 Auth Key not configured. Set it in Settings or as MSG91_AUTH_KEY env variable." },
            { status: 500 }
        );
    }

    // Get the integrated number
    let integratedNumber = "";
    const { data: dbNumbers } = await supabaseAdmin
        .from("integrated_numbers")
        .select("number")
        .eq("active", true)
        .limit(1)
        .maybeSingle();
    if (dbNumbers?.number) {
        integratedNumber = dbNumbers.number;
    }

    // Fetch the local template
    const { data: template, error: fetchError } = await supabaseAdmin
        .from("templates_local")
        .select("*")
        .eq("id", id)
        .single();

    if (fetchError || !template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // If template was submitted to MSG91, delete it there first
    if (template.msg91_template_id) {
        try {
            console.log("[Template Delete] Deleting from MSG91:", template.msg91_template_id);

            const response = await fetch(
                `https://control.msg91.com/api/v5/whatsapp/client-panel-template/${template.msg91_template_id}/`,
                {
                    method: "DELETE",
                    headers: {
                        authkey: authKey,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        integrated_number: integratedNumber,
                        name: template.name,
                    }),
                }
            );

            const responseText = await response.text();
            console.log("[Template Delete] MSG91 response:", response.status, responseText);

            // We still delete locally even if MSG91 delete fails
            // (template might already be deleted on their side)
            if (!response.ok) {
                console.warn("[Template Delete] MSG91 delete returned error, proceeding with local delete:", responseText);
            }
        } catch (err) {
            console.warn("[Template Delete] MSG91 network error, proceeding with local delete:", err);
        }
    }

    // Delete from local DB
    const { error: deleteError } = await supabaseAdmin
        .from("templates_local")
        .delete()
        .eq("id", id);

    if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
