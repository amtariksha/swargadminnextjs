import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

/**
 * Map named variables {{name}} to numbered {{1}}, {{2}} etc.
 */
function mapNamedToNumberedVariables(bodyText: string): { numberedBody: string; variableOrder: string[] } {
    const varRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
    const variableOrder: string[] = [];
    let match;

    while ((match = varRegex.exec(bodyText)) !== null) {
        if (!variableOrder.includes(match[1])) {
            variableOrder.push(match[1]);
        }
    }

    let numberedBody = bodyText;
    variableOrder.forEach((varName, index) => {
        numberedBody = numberedBody.replace(
            new RegExp(`\\{\\{${varName}\\}\\}`, "g"),
            `{{${index + 1}}}`
        );
    });

    return { numberedBody, variableOrder };
}

// ─── PUT /api/templates/local/[id]/edit-remote ────────────────
// Edit a template on MSG91 (already submitted/approved)
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId } = getRequestContext(request.headers);
    const { id } = await params;
    const body = await request.json();

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
        .eq("org_id", orgId)
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
        .eq("org_id", orgId)
        .single();

    if (fetchError || !template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (!template.msg91_template_id) {
        return NextResponse.json(
            { error: "Template has not been submitted to MSG91 yet. Submit it first." },
            { status: 400 }
        );
    }

    // Map named variables
    const { numberedBody, variableOrder } = mapNamedToNumberedVariables(body.body || template.body);
    const variableSamples: Record<string, string> = body.variableSamples || template.variable_samples || {};

    // Build MSG91 components from request body
    const components: Record<string, unknown>[] = [];

    // Header
    const headerType = (body.headerType || "").toUpperCase();
    if (headerType === "TEXT" && body.headerContent) {
        components.push({ type: "HEADER", format: "TEXT", text: body.headerContent });
    } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && body.headerContent) {
        components.push({
            type: "HEADER",
            format: headerType,
            example: { header_handle: [body.headerContent] },
        });
    } else if (headerType === "LOCATION") {
        components.push({ type: "HEADER", format: "LOCATION" });
    }

    // Body with numbered variables and example values
    const bodyComponent: Record<string, unknown> = {
        type: "BODY",
        text: numberedBody,
    };
    if (variableOrder.length > 0) {
        const sampleValues = variableOrder.map(
            (varName) => variableSamples[varName] || varName
        );
        bodyComponent.example = { body_text: [sampleValues] };
    }
    components.push(bodyComponent);

    // Footer
    if (body.footer) {
        components.push({ type: "FOOTER", text: body.footer });
    }

    // Buttons
    if (body.buttons && Array.isArray(body.buttons) && body.buttons.length > 0) {
        const mappedButtons = body.buttons.map((btn: Record<string, unknown>) => {
            const btnType = (btn.type as string || "").toUpperCase();
            if (btnType === "QUICK_REPLY") {
                return { type: "QUICK_REPLY", text: btn.text };
            } else if (btnType === "URL") {
                const urlBtn: Record<string, unknown> = { type: "URL", text: btn.text, url: btn.url };
                if (btn.url_type === "dynamic") urlBtn.example = [btn.url];
                return urlBtn;
            } else if (btnType === "PHONE_NUMBER") {
                return { type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone_number };
            } else if (btnType === "COPY_CODE") {
                return { type: "COPY_CODE", example: btn.example || "" };
            }
            return btn;
        });
        components.push({ type: "BUTTONS", buttons: mappedButtons });
    }

    const msg91Payload: Record<string, unknown> = {
        integrated_number: integratedNumber,
        components,
    };

    try {
        console.log("[Template Edit] Editing on MSG91:", template.msg91_template_id, JSON.stringify(msg91Payload, null, 2));

        const response = await fetch(
            `https://control.msg91.com/api/v5/whatsapp/client-panel-template/${template.msg91_template_id}/`,
            {
                method: "PUT",
                headers: {
                    authkey: authKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(msg91Payload),
            }
        );

        const responseText = await response.text();
        let responseData: unknown;
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = responseText;
        }

        console.log("[Template Edit] MSG91 response:", response.status, responseText);

        if (!response.ok) {
            const msg91Error = typeof responseData === "object" && responseData !== null
                ? ((responseData as Record<string, unknown>)?.message || (responseData as Record<string, unknown>)?.errors || (responseData as Record<string, unknown>)?.error || responseText)
                : responseText;
            return NextResponse.json(
                {
                    error: `MSG91 error (${response.status}): ${typeof msg91Error === "string" ? msg91Error : JSON.stringify(msg91Error)}`,
                    details: responseData,
                },
                { status: 502 }
            );
        }

        if (typeof responseData === "object" && responseData !== null && (responseData as Record<string, unknown>)?.hasError) {
            const errData = responseData as Record<string, unknown>;
            const msg91Error = errData.errors || errData.message || "MSG91 returned an error";
            return NextResponse.json(
                {
                    error: typeof msg91Error === "string" ? msg91Error : JSON.stringify(msg91Error),
                    details: responseData,
                },
                { status: 502 }
            );
        }

        // Update local template with new content + set status to pending
        const updateData: Record<string, unknown> = {
            status: "pending",
            updated_at: new Date().toISOString(),
        };
        if (body.body !== undefined) updateData.body = body.body;
        if (body.headerType !== undefined) updateData.header_type = body.headerType;
        if (body.headerContent !== undefined) updateData.header_content = body.headerContent;
        if (body.footer !== undefined) updateData.footer = body.footer;
        if (body.buttons !== undefined) updateData.buttons = body.buttons;
        if (body.variableSamples !== undefined) updateData.variable_samples = body.variableSamples;

        await supabaseAdmin
            .from("templates_local")
            .update(updateData)
            .eq("id", id)
            .eq("org_id", orgId);

        return NextResponse.json({
            success: true,
            status: "pending",
            msg91Response: responseData,
        });
    } catch (err) {
        console.error("[Template Edit] Network error:", err);
        return NextResponse.json(
            { error: "Failed to connect to MSG91" },
            { status: 500 }
        );
    }
}
