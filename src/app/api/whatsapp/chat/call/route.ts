import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

// ─── POST /api/chat/call ──────────────────────────────────
// Initiate a WhatsApp voice call via MSG91
export async function POST(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);

    // Triple-source auth key resolution
    let authKey = await getAppSetting("msg91_auth_key", "", orgId);
    if (!authKey) {
        const { data: orgRow } = await supabaseAdmin
            .from("organizations")
            .select("msg91_auth_key")
            .eq("id", orgId)
            .maybeSingle();
        if (orgRow?.msg91_auth_key) authKey = orgRow.msg91_auth_key;
    }
    if (!authKey && process.env.MSG91_AUTH_KEY) {
        authKey = process.env.MSG91_AUTH_KEY;
    }
    if (!authKey) {
        return NextResponse.json(
            { error: "MSG91 Auth Key not configured. Set it in Settings or as MSG91_AUTH_KEY env variable." },
            { status: 500 }
        );
    }

    const body = await request.json();
    const { phone, integratedNumber, conversationId } = body;

    if (!phone || !integratedNumber) {
        return NextResponse.json(
            { error: "phone and integratedNumber are required" },
            { status: 400 }
        );
    }

    try {
        // Initiate voice call via MSG91
        const response = await fetch(
            "https://control.msg91.com/api/v5/whatsapp/whatsapp-voice-call",
            {
                method: "POST",
                headers: {
                    authkey: authKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    integrated_number: integratedNumber.replace(/^\+/, ""),
                    recipient_number: phone.replace(/^\+/, ""),
                }),
            }
        );

        const responseText = await response.text();
        console.log("[Voice Call] MSG91 response:", response.status, responseText);

        let msg91Data: any;
        try {
            msg91Data = JSON.parse(responseText);
        } catch {
            msg91Data = { raw: responseText };
        }

        if (!response.ok) {
            return NextResponse.json(
                {
                    error: "Failed to initiate voice call",
                    details: msg91Data,
                },
                { status: response.status }
            );
        }

        // Insert a system message in the conversation about the call
        if (conversationId) {
            await supabaseAdmin.from("messages").insert({
                conversation_id: conversationId,
                direction: "outbound",
                content_type: "voice_call",
                body: "Voice call initiated",
                status: "sent",
                source: "webapp",
            });

            // Update conversation last_message
            await supabaseAdmin
                .from("conversations")
                .update({
                    last_message: "📞 Voice call initiated",
                    last_message_time: new Date().toISOString(),
                })
                .eq("id", conversationId);
        }

        return NextResponse.json({
            success: true,
            callData: msg91Data,
        });
    } catch (err) {
        console.error("[Voice Call] Error:", err);
        return NextResponse.json(
            { error: "Failed to initiate voice call" },
            { status: 500 }
        );
    }
}
