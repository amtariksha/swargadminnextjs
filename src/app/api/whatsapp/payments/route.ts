import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getAppSetting } from "@/lib/whatsapp/settings";
import { getRequestContext } from "@/lib/whatsapp/request";

function mapPayment(row: Record<string, unknown>) {
    return {
        id: row.id,
        contactId: row.contact_id || undefined,
        conversationId: row.conversation_id || undefined,
        contactName: row.contact_name,
        phone: row.phone,
        amount: Number(row.amount),
        currency: row.currency || "INR",
        description: row.description || undefined,
        razorpayLinkId: row.razorpay_link_id || undefined,
        razorpayPaymentId: row.razorpay_payment_id || undefined,
        shortUrl: row.short_url || undefined,
        transactionRef: row.transaction_ref || undefined,
        messageStatus: row.message_status || "pending",
        paymentStatus: row.payment_status || "created",
        createdBy: row.created_by || "Sales",
        integratedNumber: row.integrated_number || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// ─── GET /api/payments ─────────────────────────────────────
export async function GET(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    let query = supabaseAdmin
        .from("payments")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

    if (!isSuperAdmin) {
        query = query.eq("org_id", orgId);
    }

    if (status && status !== "all") {
        query = query.eq("payment_status", status);
    }

    if (from) {
        query = query.gte("created_at", from);
    }
    if (to) {
        query = query.lte("created_at", to);
    }

    // Apply pagination
    const rangeFrom = (page - 1) * limit;
    const rangeTo = rangeFrom + limit - 1;
    query = query.range(rangeFrom, rangeTo);

    const { data, error, count } = await query;
    const total = count || 0;

    if (error) {
        console.error("Payments fetch error:", error);
        return NextResponse.json({
            payments: [],
            total: 0,
            page,
            limit,
            summary: {
                created: { count: 0, total: 0 },
                paid: { count: 0, total: 0 },
                unpaid: { count: 0, total: 0 },
                cancelled: { count: 0, total: 0 },
            },
        });
    }

    const payments = (data || []).map(mapPayment);

    // Calculate summary from current page (for a more accurate global summary,
    // we'd need a separate aggregation query, but page-level is fine for now)
    const summary = {
        created: { count: total, total: payments.reduce((s, p) => s + p.amount, 0) },
        paid: {
            count: payments.filter((p) => p.paymentStatus === "paid").length,
            total: payments.filter((p) => p.paymentStatus === "paid").reduce((s, p) => s + p.amount, 0),
        },
        unpaid: {
            count: payments.filter((p) => p.paymentStatus === "unpaid" || p.paymentStatus === "created").length,
            total: payments
                .filter((p) => p.paymentStatus === "unpaid" || p.paymentStatus === "created")
                .reduce((s, p) => s + p.amount, 0),
        },
        cancelled: {
            count: payments.filter((p) => p.paymentStatus === "cancelled" || p.paymentStatus === "expired").length,
            total: payments
                .filter((p) => p.paymentStatus === "cancelled" || p.paymentStatus === "expired")
                .reduce((s, p) => s + p.amount, 0),
        },
    };

    return NextResponse.json({ payments, total, page, limit, summary });
}

// ─── POST /api/payments ────────────────────────────────────
export async function POST(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const body = await request.json();
    const {
        contactName,
        phone,
        amount,
        description,
        contactId,
        conversationId,
        integratedNumber,
        sendViaWhatsApp,
    } = body;

    const keyId = await getAppSetting("razorpay_key_id", process.env.RAZORPAY_KEY_ID || "", orgId);
    const keySecret = await getAppSetting("razorpay_key_secret", process.env.RAZORPAY_KEY_SECRET || "", orgId);

    let razorpayLinkId: string | null = null;
    let shortUrl: string | null = null;

    // ─── Create Razorpay Payment Link ────────────────────────
    if (keyId && keySecret) {
        try {
            const rpResponse = await fetch(
                "https://api.razorpay.com/v1/payment_links",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization:
                            "Basic " +
                            Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
                    },
                    body: JSON.stringify({
                        amount: Math.round(amount * 100), // Razorpay expects paise
                        currency: "INR",
                        description: description || `Payment from ${contactName}`,
                        customer: {
                            name: contactName,
                            contact: `+${phone.replace(/^\+/, "")}`,
                        },
                        notify: { sms: false, email: false }, // We send via WhatsApp
                        reminder_enable: true,
                        callback_url: "",
                        callback_method: "get",
                    }),
                }
            );

            if (rpResponse.ok) {
                const rpData = await rpResponse.json();
                razorpayLinkId = rpData.id;
                shortUrl = rpData.short_url;
            } else {
                const errorText = await rpResponse.text();
                console.error("Razorpay error:", errorText);
            }
        } catch (err) {
            console.error("Razorpay create link error:", err);
        }
    }

    // ─── Store in Supabase ───────────────────────────────────
    const { data: payment, error } = await supabaseAdmin
        .from("payments")
        .insert({
            contact_id: contactId || null,
            conversation_id: conversationId || null,
            contact_name: contactName,
            phone: phone.replace(/^\+/, ""),
            amount,
            currency: "INR",
            description: description || null,
            razorpay_link_id: razorpayLinkId,
            short_url: shortUrl,
            message_status: "pending",
            payment_status: "created",
            created_by: integratedNumber ? "Sales" : "Sales",
            integrated_number: integratedNumber || null,
            org_id: isSuperAdmin && body.orgId ? body.orgId : orgId,
        })
        .select()
        .single();

    if (error) {
        console.error("Payment insert error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ─── Optionally send payment link via WhatsApp ───────────
    // Also allow sending when no conversationId — look up by phone
    let resolvedConversationId = conversationId || null;

    if (sendViaWhatsApp && shortUrl && !resolvedConversationId) {
        // Try to find an existing conversation for this phone number
        const cleanPhoneLookup = phone.replace(/^\+/, "");
        const { data: contactRow } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("phone", cleanPhoneLookup)
            .single();
        if (contactRow) {
            const { data: conv } = await supabaseAdmin
                .from("conversations")
                .select("id")
                .eq("contact_id", contactRow.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (conv) {
                resolvedConversationId = conv.id;
            }
        }
    }

    if (sendViaWhatsApp && shortUrl) {
        const msgAuthKey = await getAppSetting("msg91_auth_key", process.env.MSG91_AUTH_KEY || "", orgId);
        // Resolve the sender number: explicit > the conversation's number > the
        // org's first active number. Never fall back to the "919999999999"
        // placeholder — it isn't a registered MSG91 number and guarantees failure.
        let sendFromNumber: string | null = integratedNumber || null;
        if (!sendFromNumber && resolvedConversationId) {
            const { data: convRow } = await supabaseAdmin
                .from("conversations")
                .select("integrated_number")
                .eq("id", resolvedConversationId)
                .maybeSingle();
            sendFromNumber = convRow?.integrated_number || null;
        }
        if (!sendFromNumber) {
            const { data: firstNumber } = await supabaseAdmin
                .from("integrated_numbers")
                .select("number")
                .eq("org_id", orgId)
                .eq("active", true)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
            sendFromNumber = firstNumber?.number || null;
        }
        const cleanPhone = phone.replace(/^\+/, "");
        const messageText = `💰 Payment Link\n\nAmount: ₹${amount.toLocaleString("en-IN")}\n${description ? `For: ${description}\n` : ""}\nPay here: ${shortUrl}`;

        let sendStatus: "sent" | "failed" = "failed";
        let providerMessageId: string | undefined;
        let failureReason: string | null = null;

        // Check if the 24-hour session window is still open
        let sessionActive = false;
        if (resolvedConversationId) {
            const { data: convData } = await supabaseAdmin
                .from("conversations")
                .select("last_incoming_timestamp")
                .eq("id", resolvedConversationId)
                .single();
            if (convData?.last_incoming_timestamp) {
                const lastIncoming = new Date(convData.last_incoming_timestamp).getTime();
                const hoursElapsed = (Date.now() - lastIncoming) / (1000 * 60 * 60);
                sessionActive = hoursElapsed < 23.5; // 30 min buffer before 24h expiry
            }
        }

        const paymentTemplateName = await getAppSetting("payment_template_name", process.env.MSG91_PAYMENT_TEMPLATE_NAME || "");

        if (msgAuthKey) {
            if (sessionActive) {
                // ─── Session message (within 24h window) ───
                try {
                    console.log("[Payment WA Send] Session active, sending as text message");
                    const response = await fetch(
                        "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/",
                        {
                            method: "POST",
                            headers: {
                                Authkey: msgAuthKey,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                integrated_number: sendFromNumber,
                                content_type: "text",
                                recipient_number: cleanPhone,
                                text: messageText,
                            }),
                        }
                    );

                    const responseText = await response.text();
                    let responseData: any;
                    try { responseData = JSON.parse(responseText); } catch { responseData = responseText; }

                    if (!response.ok) {
                        console.error("[Payment WA Send] MSG91 session error:", response.status, responseText);
                        failureReason = `MSG91 session HTTP ${response.status}: ${responseText}`.slice(0, 1000);
                    } else if (typeof responseData === "object" && responseData !== null && responseData.hasError) {
                        console.error("[Payment WA Send] MSG91 session API error:", responseText);
                        failureReason = `MSG91 session error: ${typeof responseData.errors === "string" ? responseData.errors : JSON.stringify(responseData.errors)}`.slice(0, 1000);
                    } else {
                        console.log("[Payment WA Send] Session message success:", responseText);
                        sendStatus = "sent";
                        failureReason = null;
                        providerMessageId = responseData?.data?.requestId
                            || responseData?.requestId
                            || responseData?.data?.request_id;
                    }
                } catch (err) {
                    console.error("[Payment WA Send] Session message error:", err);
                    failureReason = `MSG91 session network error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 1000);
                }
            }

            // ─── Template message fallback (session expired or session send failed) ───
            if (sendStatus === "failed" && paymentTemplateName) {
                try {
                    console.log(`[Payment WA Send] Using template "${paymentTemplateName}" (session ${sessionActive ? "send failed" : "expired"})`);
                    // Template variables: {{1}} = amount, {{2}} = description, {{3}} = payment link
                    const templatePayload = {
                        integrated_number: sendFromNumber,
                        content_type: "template",
                        payload: {
                            messaging_product: "whatsapp",
                            type: "template",
                            template: {
                                name: paymentTemplateName,
                                language: { code: "en" },
                                to_and_components: [
                                    {
                                        to: [cleanPhone],
                                        components: {
                                            body_1: { type: "text", value: `₹${amount.toLocaleString("en-IN")}` },
                                            body_2: { type: "text", value: description || "Payment" },
                                            body_3: { type: "text", value: shortUrl },
                                        },
                                    },
                                ],
                            },
                        },
                    };

                    const response = await fetch(
                        "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
                        {
                            method: "POST",
                            headers: {
                                Authkey: msgAuthKey,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify(templatePayload),
                        }
                    );

                    const responseText = await response.text();
                    let responseData: any;
                    try { responseData = JSON.parse(responseText); } catch { responseData = responseText; }

                    if (!response.ok) {
                        console.error("[Payment WA Send] Template error:", response.status, responseText);
                        failureReason = `MSG91 template HTTP ${response.status}: ${responseText}`.slice(0, 1000);
                    } else if (typeof responseData === "object" && responseData !== null && responseData.hasError) {
                        console.error("[Payment WA Send] Template API error:", responseText);
                        failureReason = `MSG91 template error: ${typeof responseData.errors === "string" ? responseData.errors : JSON.stringify(responseData.errors)}`.slice(0, 1000);
                    } else {
                        console.log("[Payment WA Send] Template message success:", responseText);
                        sendStatus = "sent";
                        failureReason = null;
                        providerMessageId = responseData?.data?.requestId
                            || responseData?.requestId
                            || responseData?.data?.request_id;
                    }
                } catch (err) {
                    console.error("[Payment WA Send] Template message error:", err);
                    failureReason = `MSG91 template network error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 1000);
                }
            }

            // If no template configured and session is expired, log a helpful message
            if (sendStatus === "failed" && !sessionActive && !paymentTemplateName) {
                console.error("[Payment WA Send] Session expired and no MSG91_PAYMENT_TEMPLATE_NAME configured. Set this env var with an approved WhatsApp template name to send payment links outside the 24h window.");
                if (!failureReason) {
                    failureReason = "Session window closed (no inbound in 24h) and no payment_template_name configured — payment link cannot be sent outside the 24h window. Set an approved template at /whatsapp/settings.";
                }
            }
        } else {
            console.error("[Payment WA Send] MSG91_AUTH_KEY not configured");
            failureReason = "MSG91 auth key not configured (app_settings.msg91_auth_key / MSG91_AUTH_KEY).";
        }

        // Persist the payment link message
        if (resolvedConversationId) {
            await supabaseAdmin.from("messages").insert({
                conversation_id: resolvedConversationId,
                direction: "outbound",
                content_type: "text",
                body: `💰 Payment Link — ₹${amount.toLocaleString("en-IN")}${description ? ` (${description})` : ""}\n${shortUrl}`,
                status: sendStatus,
                is_internal_note: false,
                integrated_number: sendFromNumber,
                external_id: providerMessageId || null,
                request_id: providerMessageId || null,
                source: "webapp",
                failure_reason: sendStatus === "failed" ? failureReason : null,
                failed_at: sendStatus === "failed" ? new Date().toISOString() : null,
            });

            // Update conversation last message
            await supabaseAdmin
                .from("conversations")
                .update({
                    last_message: `💰 Payment: ₹${amount.toLocaleString("en-IN")}`,
                    last_message_time: new Date().toISOString(),
                })
                .eq("id", resolvedConversationId);
        }

        // Update payment message status
        await supabaseAdmin
            .from("payments")
            .update({ message_status: sendStatus })
            .eq("id", payment.id);
    }

    return NextResponse.json(mapPayment(payment), { status: 201 });
}
