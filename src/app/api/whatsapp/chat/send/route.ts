import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

// ─── POST /api/chat/send ──────────────────────────────────
export async function POST(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const body = await request.json();
    const {
        to,
        contentType,
        conversationId,
        integratedNumber,
    } = body;

    // Clean phone number (remove + prefix if present)
    const phone = to.replace(/^\+/, "");

    // ─── Resolve the sending number ────────────────────────────
    // The frontend sends activeNumber?.number || conversation.integratedNumber
    // Old conversations may have "default" or stale values, so we resolve properly
    let sendFromNumber = integratedNumber;
    let numConfig: Record<string, any> | null = null;

    // Try to find the specified number in DB
    if (sendFromNumber && sendFromNumber !== "default") {
        let numQuery = supabaseAdmin
            .from("integrated_numbers")
            .select("*")
            .eq("number", sendFromNumber);

        if (!isSuperAdmin) {
            numQuery = numQuery.eq("org_id", orgId);
        }

        const { data } = await numQuery.maybeSingle();
        numConfig = data;
    }

    // If number not found or was "default", fall back to org's first active number
    if (!numConfig) {
        const { data: fallbackNum } = await supabaseAdmin
            .from("integrated_numbers")
            .select("*")
            .eq("org_id", orgId)
            .eq("active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (fallbackNum) {
            numConfig = fallbackNum;
            sendFromNumber = fallbackNum.number;
            console.log(`[Chat Send] Resolved sending number to: ${sendFromNumber} (provider: ${fallbackNum.provider})`);
        }
    }

    if (!sendFromNumber || sendFromNumber === "default") {
        return NextResponse.json({ error: "No integrated number configured. Add one in Settings → WhatsApp Numbers." }, { status: 400 });
    }

    const provider = numConfig?.provider || "msg91";
    console.log(`[Chat Send] Using provider: ${provider}, number: ${sendFromNumber}`);

    // MSG91 has two different APIs:
    //   Template messages → POST .../whatsapp-outbound-message/bulk/  (nested payload with to_and_components)
    //   Session messages  → POST .../whatsapp-outbound-message/       (flat structure)
    // See: https://docs.msg91.com/whatsapp
    let msg91Payload: Record<string, unknown>;
    let msg91Endpoint = "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/";
    let messageBody = "";

    if (contentType === "template") {
        const { templateName, templateLanguage, components } = body;
        // Template API uses the bulk endpoint with to_and_components
        msg91Endpoint = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";
        msg91Payload = {
            integrated_number: sendFromNumber,
            content_type: "template",
            payload: {
                messaging_product: "whatsapp",
                type: "template",
                template: {
                    name: templateName,
                    language: { code: templateLanguage || "en" },
                    to_and_components: [
                        {
                            to: [phone],
                            components: components || {},
                        },
                    ],
                },
            },
        };
        messageBody = `[Template: ${templateName}]`;
    } else if (contentType === "document" || contentType === "image") {
        const { mediaUrl, fileName } = body;
        const mediaType = contentType === "image" ? "image" : "document";
        msg91Payload = {
            integrated_number: sendFromNumber,
            content_type: mediaType,
            recipient_number: phone,
            payload: {
                type: mediaType,
                [mediaType]: {
                    link: mediaUrl,
                    ...(fileName ? { filename: fileName } : {}),
                },
            },
        };
        messageBody = fileName || `[${mediaType}]`;
    } else if (contentType === "location") {
        const { location } = body as Record<string, any>;
        msg91Payload = {
            integrated_number: sendFromNumber,
            content_type: "location",
            recipient_number: phone,
            payload: {
                type: "location",
                location: {
                    longitude: location.longitude,
                    latitude: location.latitude,
                    name: location.name,
                    address: location.address,
                },
            },
        };
        messageBody = `[Location: ${location.name || location.address}]`;
    } else if (contentType === "contact") {
        const { contacts } = body as Record<string, any>;
        msg91Payload = {
            integrated_number: sendFromNumber,
            content_type: "contacts",
            recipient_number: phone,
            payload: {
                type: "contacts",
                contacts: contacts,
            },
        };
        messageBody = `[Contact: ${contacts?.[0]?.name?.formatted_name || "Shared Contact"}]`;
    } else if (contentType === "interactive") {
        const { interactive, text } = body as Record<string, any>;
        msg91Payload = {
            integrated_number: sendFromNumber,
            content_type: "interactive",
            recipient_number: phone,
            payload: {
                type: "interactive",
                interactive: interactive,
            },
        };
        messageBody = interactive?.body?.text || text || "[Interactive Message]";
    } else {
        // Session text message — flat structure, no nested payload
        const { text } = body;
        msg91Payload = {
            integrated_number: sendFromNumber,
            content_type: "text",
            recipient_number: phone,
            text: text,
        };
        messageBody = text;
    }

    let finalStatus = "sent";
    let finalResponse: unknown = null;
    let failureReason: string | null = null;

    if (provider === "meta") {
        // ─── Send via Meta Cloud API ──────────────────────────────
        const metaPhoneNumberId = numConfig?.meta_phone_number_id;
        const metaAccessToken = numConfig?.meta_access_token;
        if (!metaPhoneNumberId || !metaAccessToken) {
            return NextResponse.json({ error: "Meta credentials not configured for this number" }, { status: 500 });
        }

        let metaPayload: Record<string, unknown> = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phone,
        };

        if (contentType === "template") {
            const { templateName, templateLanguage, components } = body;
            const mappedComponents = Object.entries(components || {}).map(([key, value]: [string, any]) => ({
                type: value.type,
                parameters: [{
                    type: "text",
                    text: value.value
                }]
            }));

            metaPayload = {
                ...metaPayload,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: templateLanguage || "en" },
                    components: mappedComponents.length > 0 ? [{ type: "body", parameters: mappedComponents.map(c => c.parameters[0]) }] : [],
                },
            };
        } else if (contentType === "document" || contentType === "image") {
            const { mediaUrl, fileName } = body;
            const mediaType = contentType === "image" ? "image" : "document";
            metaPayload = {
                ...metaPayload,
                type: mediaType,
                [mediaType]: {
                    link: mediaUrl,
                    ...(fileName && mediaType === "document" ? { filename: fileName } : {}),
                },
            };
        } else {
            // Default text
            const { text } = body;
            metaPayload = {
                ...metaPayload,
                type: "text",
                text: { preview_url: false, body: text },
            };
        }

        try {
            const response = await fetch(
                `https://graph.facebook.com/v19.0/${metaPhoneNumberId}/messages`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${metaAccessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(metaPayload),
                }
            );

            const responseText = await response.text();
            try { finalResponse = JSON.parse(responseText); } catch { finalResponse = responseText; }

            if (!response.ok) {
                console.error("[Chat Send] Meta error:", response.status, responseText);
                finalStatus = "failed";
                failureReason = `Meta HTTP ${response.status}: ${responseText}`.slice(0, 1000);
            } else {
                console.log("[Chat Send] Meta success:", responseText);
                const data = finalResponse as { messages?: { id: string }[] };
                if (data?.messages?.[0]?.id) {
                    // Save the Meta message ID. Wait, I'll store it in msg91_message_id for now 
                    // or maybe create a meta_message_id column? Let's use request_id for it
                }
            }
        } catch (err) {
            console.error("[Chat Send] Meta network error:", err);
            finalStatus = "failed";
            failureReason = `Meta network error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 1000);
        }
    } else {
        // ─── Send via MSG91 ──────────────────────────────────────
        // Check app_settings first, then organizations table, then env var
        let authKey = "";
        let authKeySource = "";

        const appSettingKey = await getAppSetting("msg91_auth_key", "", orgId);
        if (appSettingKey) {
            authKey = appSettingKey;
            authKeySource = "app_settings";
        }

        if (!authKey) {
            const { data: orgRow } = await supabaseAdmin
                .from("organizations")
                .select("msg91_auth_key")
                .eq("id", orgId)
                .maybeSingle();
            if (orgRow?.msg91_auth_key) {
                authKey = orgRow.msg91_auth_key;
                authKeySource = "organizations_table";
            }
        }

        if (!authKey && process.env.MSG91_AUTH_KEY) {
            authKey = process.env.MSG91_AUTH_KEY;
            authKeySource = "env_var";
        }

        console.log(`[Chat Send] Auth key source: ${authKeySource}, ending: ...${authKey.slice(-6)}, orgId: ${orgId}`);

        if (!authKey) {
            return NextResponse.json({ error: "MSG91 Auth Key not configured. Set it in Settings or as MSG91_AUTH_KEY env variable." }, { status: 500 });
        }

        try {
            console.log(`[Chat Send] MSG91 endpoint: ${msg91Endpoint}`);
            console.log(`[Chat Send] MSG91 payload:`, JSON.stringify(msg91Payload, null, 2));
            const response = await fetch(
                msg91Endpoint,
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
            try { finalResponse = JSON.parse(responseText); } catch { finalResponse = responseText; }

            if (!response.ok) {
                console.error("[Chat Send] MSG91 HTTP error:", response.status, responseText);
                console.error("[Chat Send] Payload was:", JSON.stringify(msg91Payload, null, 2));
                finalStatus = "failed";
                failureReason = `MSG91 HTTP ${response.status}: ${responseText}`.slice(0, 1000);
            } else if (typeof finalResponse === "object" && finalResponse !== null && (finalResponse as any).hasError) {
                // MSG91 sometimes returns 200 with { hasError: true, errors: "..." }
                const errMsg = (finalResponse as any).errors || "";
                const errText = typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg);
                console.error("[Chat Send] MSG91 API error:", responseText);
                console.error("[Chat Send] Payload was:", JSON.stringify(msg91Payload, null, 2));
                const notIntegrated = errText.includes("not integrated");
                if (notIntegrated) {
                    console.error(`[Chat Send] Number ${sendFromNumber} is not integrated on MSG91. Verify the number is activated on your MSG91 account, or check if this number uses Meta provider instead.`);
                }
                finalStatus = "failed";
                failureReason = `MSG91 error: ${errText}${notIntegrated ? ` — number ${sendFromNumber} not activated on MSG91` : ""}`.slice(0, 1000);
            } else {
                console.log("[Chat Send] MSG91 success:", responseText);
            }
        } catch (err) {
            console.error("[Chat Send] MSG91 network error:", err);
            finalStatus = "failed";
            failureReason = `MSG91 network error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 1000);
        }
    }

    // Extract provider message ID for delivery report correlation
    const metaMessageId = provider === "meta" && (finalResponse as any)?.messages?.[0]?.id
        ? (finalResponse as any).messages[0].id
        : undefined;
    const msg91RequestId = provider !== "meta" && typeof finalResponse === "object" && finalResponse !== null
        ? ((finalResponse as any).data?.requestId || (finalResponse as any).requestId || (finalResponse as any).data?.request_id)
        : undefined;
    const providerMessageId = metaMessageId || msg91RequestId || undefined;

    // ─── Persist message in Supabase ─────────────────────────
    const { data: message, error: msgError } = await supabaseAdmin
        .from("messages")
        .insert({
            conversation_id: conversationId,
            direction: "outbound",
            content_type: contentType || "text",
            body: messageBody,
            media_url: body.mediaUrl || null,
            file_name: body.fileName || null,
            status: finalStatus,
            is_internal_note: false,
            integrated_number: sendFromNumber,
            request_id: providerMessageId,
            external_id: providerMessageId,
            source: "webapp",
            org_id: orgId,
            failure_reason: finalStatus === "failed" ? failureReason : null,
            failed_at: finalStatus === "failed" ? new Date().toISOString() : null,
        })
        .select()
        .single();

    if (msgError) {
        console.error("[Chat Send] Message persist error:", msgError);
        return NextResponse.json(
            { error: "Failed to save message", msg91Status: finalStatus },
            { status: 500 }
        );
    }

    // ─── Update conversation's last_message ──────────────────
    if (conversationId) {
        let convUpdate = supabaseAdmin
            .from("conversations")
            .update({
                last_message: messageBody,
                last_message_time: new Date().toISOString(),
            })
            .eq("id", conversationId);

        if (!isSuperAdmin) {
            convUpdate = convUpdate.eq("org_id", orgId);
        }

        await convUpdate;
    }

    // Return full message object for frontend
    return NextResponse.json({
        id: message.id,
        conversationId: message.conversation_id,
        direction: message.direction,
        contentType: message.content_type || "text",
        body: message.body || "",
        mediaUrl: message.media_url || undefined,
        fileName: message.file_name || undefined,
        status: message.status || "sent",
        isInternalNote: message.is_internal_note || false,
        timestamp: message.created_at,
        source: message.source || "webapp",
        failureReason: finalStatus === "failed" ? failureReason ?? undefined : undefined,
        providerResponse: finalResponse,
        providerError: finalStatus === "failed" ? {
            provider,
            response: finalResponse,
            hint: "Check MSG91/Meta dashboard for details. Common causes: invalid auth key, expired session window, insufficient credits, or number not registered.",
        } : undefined,
    });
}
