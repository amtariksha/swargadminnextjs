import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

/**
 * Extract named variables from body text and map them to numbered {{1}}, {{2}}, etc.
 * Returns { numberedBody, variableOrder } where variableOrder is the ordered list of variable names.
 */
function mapNamedToNumberedVariables(body: string): { numberedBody: string; variableOrder: string[] } {
    const varRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
    const variableOrder: string[] = [];
    let match;

    // Collect unique variable names in order of first appearance
    while ((match = varRegex.exec(body)) !== null) {
        if (!variableOrder.includes(match[1])) {
            variableOrder.push(match[1]);
        }
    }

    // Replace named variables with numbered ones
    let numberedBody = body;
    variableOrder.forEach((varName, index) => {
        numberedBody = numberedBody.replace(
            new RegExp(`\\{\\{${varName}\\}\\}`, "g"),
            `{{${index + 1}}}`
        );
    });

    return { numberedBody, variableOrder };
}

// ─── POST /api/templates/local/[id]/submit ───────────────────
// Submit a local template to MSG91 for WhatsApp/Facebook approval
export async function POST(
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

    // Get the integrated number (required by MSG91)
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
        return NextResponse.json(
            { error: "Template not found" },
            { status: 404 }
        );
    }

    if (template.status !== "draft" && template.status !== "rejected") {
        return NextResponse.json(
            { error: `Template is already ${template.status}. Only draft or rejected templates can be submitted.` },
            { status: 400 }
        );
    }

    // Map named variables to numbered variables
    const { numberedBody, variableOrder } = mapNamedToNumberedVariables(template.body);
    const variableSamples: Record<string, string> = template.variable_samples || {};

    // Build the MSG91 template payload
    const components: Record<string, unknown>[] = [];

    // Header component (optional)
    if (template.header_type) {
        const headerType = template.header_type.toUpperCase();
        if (headerType === "TEXT" && template.header_content) {
            components.push({
                type: "HEADER",
                format: "TEXT",
                text: template.header_content,
            });
        } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && template.header_content) {
            // Media header — content is the URL
            const headerComponent: Record<string, unknown> = {
                type: "HEADER",
                format: headerType,
            };
            // Provide example handle/URL for media headers
            headerComponent.example = {
                header_handle: [template.header_content],
            };
            components.push(headerComponent);
        } else if (headerType === "LOCATION") {
            components.push({
                type: "HEADER",
                format: "LOCATION",
            });
        }
    }

    // Body component (required) — use numbered variables
    const bodyComponent: Record<string, unknown> = {
        type: "BODY",
        text: numberedBody,
    };

    // Add example values if we have variables
    if (variableOrder.length > 0) {
        const sampleValues = variableOrder.map(
            (varName) => variableSamples[varName] || varName
        );
        bodyComponent.example = {
            body_text: [sampleValues],
        };
    }
    components.push(bodyComponent);

    // Footer component (optional)
    if (template.footer) {
        components.push({
            type: "FOOTER",
            text: template.footer,
        });
    }

    // Buttons (optional) — map to WhatsApp API format
    if (template.buttons && Array.isArray(template.buttons) && template.buttons.length > 0) {
        const mappedButtons = template.buttons.map((btn: Record<string, unknown>) => {
            const btnType = (btn.type as string || "").toUpperCase();
            if (btnType === "QUICK_REPLY") {
                return { type: "QUICK_REPLY", text: btn.text };
            } else if (btnType === "URL") {
                const urlBtn: Record<string, unknown> = {
                    type: "URL",
                    text: btn.text,
                    url: btn.url,
                };
                if (btn.url_type === "dynamic") {
                    urlBtn.example = [btn.url];
                }
                return urlBtn;
            } else if (btnType === "PHONE_NUMBER") {
                return {
                    type: "PHONE_NUMBER",
                    text: btn.text,
                    phone_number: btn.phone_number,
                };
            } else if (btnType === "COPY_CODE") {
                return {
                    type: "COPY_CODE",
                    example: btn.example || "",
                };
            }
            return btn;
        });

        components.push({
            type: "BUTTONS",
            buttons: mappedButtons,
        });
    }

    const msg91Payload: Record<string, unknown> = {
        template_name: template.name,
        category: template.category || "MARKETING",
        language: template.language || "en",
        components,
    };

    if (integratedNumber) {
        msg91Payload.integrated_number = integratedNumber;
    }

    try {
        console.log("[Template Submit] Submitting to MSG91:", JSON.stringify(msg91Payload, null, 2));

        const response = await fetch(
            "https://api.msg91.com/api/v5/whatsapp/client-panel-template/",
            {
                method: "POST",
                headers: {
                    authkey: authKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(msg91Payload),
            }
        );

        const responseText = await response.text();
        let responseData: any;
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = responseText;
        }

        console.log("[Template Submit] MSG91 response:", response.status, responseText);

        if (!response.ok) {
            console.error("[Template Submit] MSG91 HTTP error:", response.status, responseText);
            const msg91Error = typeof responseData === "object"
                ? (responseData?.message || responseData?.errors || responseData?.error || responseText)
                : responseText;
            return NextResponse.json(
                {
                    error: `MSG91 error (${response.status}): ${typeof msg91Error === "string" ? msg91Error : JSON.stringify(msg91Error)}`,
                    details: responseData,
                },
                { status: 502 }
            );
        }

        if (typeof responseData === "object" && responseData?.hasError) {
            console.error("[Template Submit] MSG91 API error:", responseText);
            const msg91Error = responseData.errors || responseData.message || "MSG91 returned an error";
            return NextResponse.json(
                {
                    error: typeof msg91Error === "string" ? msg91Error : JSON.stringify(msg91Error),
                    details: responseData,
                },
                { status: 502 }
            );
        }

        // Extract MSG91 template ID from response
        const msg91TemplateId =
            responseData?.data?.id ||
            responseData?.data?.template_id ||
            responseData?.id ||
            responseData?.template_id ||
            null;

        // Update local template status to "pending" and store MSG91 ID
        const { error: updateError } = await supabaseAdmin
            .from("templates_local")
            .update({
                status: "pending",
                msg91_template_id: msg91TemplateId,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id);

        if (updateError) {
            console.error("[Template Submit] DB update error:", updateError);
        }

        return NextResponse.json({
            success: true,
            status: "pending",
            msg91TemplateId,
            msg91Response: responseData,
        });
    } catch (err) {
        console.error("[Template Submit] Network error:", err);
        return NextResponse.json(
            { error: "Failed to connect to MSG91" },
            { status: 500 }
        );
    }
}
