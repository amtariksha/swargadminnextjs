import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import crypto from 'crypto';
import { isPlaceholderName } from "@/lib/whatsapp/utils";

// ─── GET /api/webhooks/meta ─────────────────────────────────
// Handles webhook verification from Meta Developer Portal
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    // Check DB first for verify token, fall back to env var
    let verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    try {
        const { data: row } = await supabaseAdmin
            .from("app_settings")
            .select("value")
            .eq("key", "meta_webhook_verify_token")
            .is("org_id", null)
            .maybeSingle();
        if (row?.value) verifyToken = row.value;
    } catch {
        // Fall back to env var on DB error
    }

    if (mode === "subscribe" && token && token === verifyToken) {
        console.log("Meta Webhook Verified!");
        return new NextResponse(challenge, { status: 200 });
    } else {
        return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }
}

// ─── POST /api/webhooks/meta ────────────────────────────────
// Handles incoming messages, echo messages (coexistence), and status updates from Meta
export async function POST(request: NextRequest) {
    try {
        // ─── Webhook Signature Verification ──────────────────
        const appSecret = process.env.FACEBOOK_APP_SECRET;
        if (appSecret) {
            const rawBody = await request.clone().text();
            const signature = request.headers.get("x-hub-signature-256");
            if (signature) {
                const expectedSig = "sha256=" + crypto
                    .createHmac("sha256", appSecret)
                    .update(rawBody)
                    .digest("hex");
                if (signature !== expectedSig) {
                    console.error("[Meta Webhook] Invalid signature");
                    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
                }
            }
        }

        const body = await request.json();

        // 1. Validate payload structure
        if (body.object !== "whatsapp_business_account") {
            return NextResponse.json({ success: true }, { status: 200 });
        }

        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (!value) {
            return NextResponse.json({ success: true }, { status: 200 });
        }

        const integratedNumberId = value.metadata?.phone_number_id;
        const integratedNumberDisplay = value.metadata?.display_phone_number?.replace(/[^0-9]/g, "") || "";

        // Resolve the business number from the phone_number_id. Single org — no
        // org scoping (org_id columns default to the single org).
        let businessPhoneNumber = integratedNumberDisplay;
        if (integratedNumberId) {
            const { data: numRow } = await supabaseAdmin
                .from("integrated_numbers")
                .select("number")
                .eq("meta_phone_number_id", integratedNumberId)
                .limit(1)
                .maybeSingle();
            if (numRow?.number) businessPhoneNumber = numRow.number;
        }

        // 2. Handle Status Updates (sent, delivered, read)
        if (value.statuses && value.statuses.length > 0) {
            const statusObj = value.statuses[0];
            const metaMessageId = statusObj.id;
            const newStatus = statusObj.status; // 'sent', 'delivered', 'read', 'failed'

            // Try request_id first, then external_id for coexistence messages
            const { data: updated } = await supabaseAdmin
                .from("messages")
                .update({ status: newStatus })
                .eq("request_id", metaMessageId)
                .select("id");

            if (!updated || updated.length === 0) {
                await supabaseAdmin
                    .from("messages")
                    .update({ status: newStatus })
                    .eq("external_id", metaMessageId);
            }

            return NextResponse.json({ success: true }, { status: 200 });
        }

        // 3. Handle Incoming Messages (including echo/coexistence messages)
        if (value.messages && value.messages.length > 0) {
            const message = value.messages[0];
            const contactInfo = value.contacts?.[0];

            const senderPhone = message.from;
            const senderName = contactInfo?.profile?.name || "Unknown";
            const messageType = message.type;
            const metaMessageId = message.id;
            const timestamp = new Date(parseInt(message.timestamp) * 1000).toISOString();

            // ─── Echo Detection (Coexistence) ─────────────────────
            // In coexistence mode, messages sent from the WA Business App
            // are echoed back as inbound webhooks. Detect by checking if
            // the sender matches our business phone number.
            const normalizedSender = senderPhone.replace(/[^0-9]/g, "");
            const isEchoMessage = normalizedSender === businessPhoneNumber;

            // ─── Deduplication by wamid ──────────────────────────
            const { data: existingMsg } = await supabaseAdmin
                .from("messages")
                .select("id")
                .or(`external_id.eq.${metaMessageId},request_id.eq.${metaMessageId}`)
                .limit(1)
                .maybeSingle();

            if (existingMsg) {
                console.log(`[Meta Webhook] Duplicate message ${metaMessageId}, skipping`);
                return NextResponse.json({ success: true, type: "duplicate_skipped" }, { status: 200 });
            }

            let messageBody = "";
            let mediaUrl = null;

            if (messageType === "text") {
                messageBody = message.text?.body || "";
            } else if (messageType === "image") {
                messageBody = message.image?.caption || "[Image]";
                mediaUrl = message.image?.id;
            } else if (messageType === "document") {
                messageBody = message.document?.filename || "[Document]";
                mediaUrl = message.document?.id;
            } else if (messageType === "audio") {
                messageBody = "[Audio]";
                mediaUrl = message.audio?.id;
            } else if (messageType === "video") {
                messageBody = message.video?.caption || "[Video]";
                mediaUrl = message.video?.id;
            } else if (messageType === "location") {
                const loc = message.location;
                messageBody = JSON.stringify({ text: "[Location]", location: loc });
            } else if (messageType === "contacts") {
                messageBody = JSON.stringify({ text: `[Contact: ${message.contacts?.[0]?.name?.formatted_name || "Shared Contact"}]`, contacts: message.contacts });
            } else if (messageType === "interactive") {
                if (message.interactive?.type === "button_reply") {
                    messageBody = message.interactive.button_reply.title;
                } else if (message.interactive?.type === "list_reply") {
                    messageBody = message.interactive.list_reply.title;
                } else {
                    messageBody = "[Interactive Response]";
                }
            } else {
                messageBody = `[${messageType}]`;
            }

            // For echo messages, the "sender" is the business. The actual
            // customer is the recipient. In Meta's webhook, the "to" field
            // isn't provided for echo, but we can derive the customer from
            // the conversation context or the message context.
            // For echo messages via smb_message_echoes, the message.to field
            // contains the customer's phone number.
            const customerPhone = isEchoMessage ? (message.to || "") : senderPhone;
            const contactName = isEchoMessage ? "" : senderName;

            if (!customerPhone) {
                // Echo message without recipient info — skip
                if (isEchoMessage) {
                    console.log(`[Meta Webhook] Echo message ${metaMessageId} has no recipient, skipping`);
                    return NextResponse.json({ success: true, type: "echo_no_recipient" }, { status: 200 });
                }
            }

            // ─── Find or create contact ──────────────────────────────
            let contactId: string;
            const { data: existingContact } = await supabaseAdmin
                .from("contacts")
                .select("id")
                .eq("phone", customerPhone)
                .single();

            if (existingContact) {
                contactId = existingContact.id;

                // Update contact name if we have a better one from Meta profile (not for echo)
                if (!isEchoMessage && senderName && senderName !== "Unknown") {
                    const { data: contactRow } = await supabaseAdmin
                        .from("contacts")
                        .select("name")
                        .eq("id", contactId)
                        .single();

                    if (contactRow && isPlaceholderName(contactRow.name)) {
                        await supabaseAdmin
                            .from("contacts")
                            .update({ name: senderName })
                            .eq("id", contactId);
                    }
                }
            } else {
                const { data: newContact, error: contactError } = await supabaseAdmin
                    .from("contacts")
                    .insert({
                        phone: customerPhone,
                        name: contactName || customerPhone,
                    })
                    .select("id")
                    .single();

                if (contactError || !newContact) {
                    throw new Error("Failed to create contact");
                }
                contactId = newContact.id;
            }

            // ─── Find or create conversation ────────────────────
            const integratedNum = businessPhoneNumber || integratedNumberDisplay || integratedNumberId;
            let conversationId: string;
            const { data: existingConv } = await supabaseAdmin
                .from("conversations")
                .select("id")
                .eq("contact_id", contactId)
                .eq("integrated_number", integratedNum)
                .single();

            if (existingConv) {
                conversationId = existingConv.id;
                const updatePayload: Record<string, unknown> = {
                    status: "open",
                    last_message: messageBody,
                    last_message_time: timestamp,
                };
                if (!isEchoMessage) {
                    updatePayload.last_incoming_timestamp = timestamp;
                }
                await supabaseAdmin
                    .from("conversations")
                    .update(updatePayload)
                    .eq("id", conversationId);

                // Increment unread count only for actual inbound messages
                if (!isEchoMessage) {
                    const { data: convData } = await supabaseAdmin
                        .from("conversations")
                        .select("unread_count")
                        .eq("id", conversationId)
                        .single();
                    if (convData) {
                        await supabaseAdmin
                            .from("conversations")
                            .update({ unread_count: (convData.unread_count || 0) + 1 })
                            .eq("id", conversationId);
                    }
                }
            } else {
                const { data: newConv, error: convError } = await supabaseAdmin
                    .from("conversations")
                    .insert({
                        contact_id: contactId,
                        integrated_number: integratedNum,
                        status: "open",
                        last_message: messageBody,
                        last_message_time: timestamp,
                        last_incoming_timestamp: isEchoMessage ? undefined : timestamp,
                        unread_count: isEchoMessage ? 0 : 1,
                    })
                    .select("id")
                    .single();

                if (convError || !newConv) {
                    throw new Error("Failed to create conversation");
                }
                conversationId = newConv.id;
            }

            // ─── Insert Message ─────────────────────────────────────
            await supabaseAdmin.from("messages").insert({
                conversation_id: conversationId,
                direction: isEchoMessage ? "outbound" : "inbound",
                content_type: messageType === "button_reply" ? "text" : (messageType === "contacts" ? "contact" : messageType),
                body: messageBody,
                status: isEchoMessage ? "sent" : "received",
                request_id: metaMessageId,
                external_id: metaMessageId,
                integrated_number: integratedNum,
                media_url: mediaUrl,
                source: isEchoMessage ? "mobile_app" : "customer",
                created_at: timestamp,
            });

            if (isEchoMessage) {
                console.log(`[Meta Webhook] Echo message saved as outbound/mobile_app for conversation ${conversationId}`);
            }

            return NextResponse.json({ success: true }, { status: 200 });
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        // Always acknowledge with 200 after a signature-verified request. Returning 5xx here risks
        // Meta disabling the webhook subscription after sustained failures (same auto-pause class of
        // outage we hit on MSG91). The signature check above already rejects unauthenticated calls.
        console.error("[Meta Webhook] Unhandled error (acknowledged to avoid webhook disablement):", error);
        return NextResponse.json({ received: true, error_logged: true }, { status: 200 });
    }
}
