import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

// ─── POST /api/chat/wa-payment ────────────────────────────
// Send a WA Native Payment (Cashfree via MSG91) interactive message
export async function POST(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);

    const body = await request.json();
    const {
        phone,
        integratedNumber,
        conversationId,
        bodyText,
        footerText,
        headerImageUrl,
        items,
    } = body;

    if (!phone || !integratedNumber || !bodyText || !items?.length) {
        return NextResponse.json(
            { error: "phone, integratedNumber, bodyText, and items are required" },
            { status: 400 }
        );
    }

    // Resolve MSG91 auth key: app_settings → organizations → env (parity with chat/send)
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

    try {
        // Build interactive payment payload
        const totalAmount = items.reduce(
            (sum: number, item: { amount: number; quantity: number }) =>
                sum + item.amount * (item.quantity || 1),
            0
        );

        const interactivePayload: Record<string, unknown> = {
            type: "order_details",
            body: { text: bodyText },
            action: {
                name: "review_and_pay",
                parameters: {
                    reference_id: `WA_PAY_${Date.now()}`,
                    type: "digital-goods",
                    payment_settings: [],
                    currency: "INR",
                    total_amount: {
                        value: Math.round(totalAmount * 100), // in paise
                        offset: 100,
                    },
                    order: {
                        items: items.map(
                            (item: { name: string; amount: number; quantity: number }) => ({
                                name: item.name,
                                amount: {
                                    value: Math.round(item.amount * 100),
                                    offset: 100,
                                },
                                quantity: item.quantity || 1,
                            })
                        ),
                    },
                },
            },
        };

        if (footerText) {
            interactivePayload.footer = { text: footerText };
        }

        if (headerImageUrl) {
            interactivePayload.header = {
                type: "image",
                image: { link: headerImageUrl },
            };
        }

        // Send via MSG91 session message endpoint
        const response = await fetch(
            "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/",
            {
                method: "POST",
                headers: {
                    Authkey: authKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    integrated_number: integratedNumber.replace(/^\+/, ""),
                    content_type: "interactive",
                    payload: {
                        to: phone.replace(/^\+/, ""),
                        type: "interactive",
                        interactive: interactivePayload,
                    },
                }),
            }
        );

        const responseText = await response.text();
        console.log("[WA Payment] MSG91 response:", response.status, responseText);

        let msg91Data: any;
        try {
            msg91Data = JSON.parse(responseText);
        } catch {
            msg91Data = { raw: responseText };
        }

        // Persist message in DB
        if (conversationId) {
            const itemsSummary = items
                .map(
                    (i: { name: string; amount: number; quantity: number }) =>
                        `${i.name} x${i.quantity || 1} = ₹${(i.amount * (i.quantity || 1)).toFixed(2)}`
                )
                .join(", ");

            await supabaseAdmin.from("messages").insert({
                conversation_id: conversationId,
                direction: "outbound",
                content_type: "interactive",
                body: `💳 Payment request: ${itemsSummary} (Total: ₹${totalAmount.toFixed(2)})`,
                status: response.ok ? "sent" : "failed",
                source: "webapp",
                integrated_number: integratedNumber.replace(/^\+/, ""),
                failure_reason: response.ok ? null : `MSG91 HTTP ${response.status}: ${responseText}`.slice(0, 1000),
                failed_at: response.ok ? null : new Date().toISOString(),
            });

            await supabaseAdmin
                .from("conversations")
                .update({
                    last_message: `💳 Payment: ₹${totalAmount.toFixed(2)}`,
                    last_message_time: new Date().toISOString(),
                })
                .eq("id", conversationId);
        }

        if (!response.ok) {
            return NextResponse.json(
                { error: "Failed to send WA payment", details: msg91Data },
                { status: response.status }
            );
        }

        return NextResponse.json({
            success: true,
            msg91Response: msg91Data,
        });
    } catch (err) {
        console.error("[WA Payment] Error:", err);
        return NextResponse.json(
            { error: "Failed to send WA payment" },
            { status: 500 }
        );
    }
}
