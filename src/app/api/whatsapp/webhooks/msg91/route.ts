import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { isPlaceholderName } from "@/lib/whatsapp/utils";
import { maybeCreateWhatsAppLead } from "@/lib/lms/leads/whatsapp-intake";

// Digits-only phone normalization + tolerant equality (exact digits OR the same
// 10-digit national tail). MSG91 field formats drift — "+91…", "91…", bare
// 10-digit — and a single missed match here flips a business-app-sent message
// to "inbound" (renders on the wrong side of the inbox).
const digitsOnly = (v: unknown): string => String(v ?? "").replace(/\D/g, "");
const phonesMatch = (a: string, b: string): boolean => {
    if (!a || !b) return false;
    if (a === b) return true;
    const tailA = a.slice(-10);
    const tailB = b.slice(-10);
    return tailA.length === 10 && tailA === tailB;
};

// ─── POST /api/webhooks/msg91 — Receive inbound messages ──
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Log the full payload for debugging
        console.log("[MSG91 Webhook] Received payload:", JSON.stringify(body));

        /*
         * MSG91 "On Inbound Request Received" payload fields:
         *   customerNumber  — sender phone (e.g. "919876543210")
         *   content         — message text
         *   requestId       — MSG91 request ID
         *   eventName       — event type
         *   crqid           — conversation request ID
         *   companyId       — MSG91 company ID
         *   requestedAt     — timestamp
         *   reason          — reason field
         *   uuid            — unique message ID
         *
         * We also handle alternative field names for flexibility.
         */
        const senderPhone =
            body.customerNumber ||
            body.from ||
            body.sender ||
            body.mobile ||
            body.phone ||
            "";
        const receiverNumber =
            body.to ||
            body.receiver ||
            body.integratedNumber ||
            body.integrated_number ||
            "";
        let messageBody =
            body.content ||
            body.message ||
            body.text ||
            body.body ||
            "";

        // Handle MSG91 pushing objects like { text: "actual message" } in the text field
        if (typeof messageBody === 'object' && messageBody !== null) {
            messageBody = messageBody.text || JSON.stringify(messageBody);
        } else if (typeof messageBody === 'string') {
            try {
                // Sometimes MSG91 sends stringified JSON: '{"text":"Refunded mam"}'
                const parsed = JSON.parse(messageBody);
                if (parsed && typeof parsed === 'object' && parsed.text) {
                    messageBody = parsed.text;
                }
            } catch (e) {
                // Ignore parse errors, it's just a normal string
            }
        }

        const contentType = body.type || "text";
        const mediaUrl = body.media_url || body.mediaUrl || null;
        const fileName = body.file_name || body.fileName || null;
        const externalId = body.uuid || body.requestId || null;

        // Extract sender name from MSG91 payload if available
        const senderName =
            body.customerName ||
            body.profile?.name ||
            body.senderName ||
            body.name ||
            body.contact_name ||
            "";

        // Extract location data if present
        let locationData = null;
        if (contentType === "location" && (body.location || (body.latitude && body.longitude))) {
            locationData = {
                longitude: body.location?.longitude || body.longitude,
                latitude: body.location?.latitude || body.latitude,
                name: body.location?.name || "",
                address: body.location?.address || ""
            };
            if (!messageBody || messageBody === "[media]") {
                messageBody = `[Location]`;
            }
        }

        // Extract contact data if present
        let contactData = null;
        // MSG91 inbound webhook uses 'contacts' for the type, but let's be safe and check both.
        if ((contentType === "contacts" || contentType === "contact") && body.contacts) {
            contactData = body.contacts; // this is usually an array of contacts
            if (!messageBody || messageBody === "[media]") {
                messageBody = `[Contact: ${contactData?.[0]?.name?.formatted_name || "Shared Contact"}]`;
            }
        }

        // Use webhookType to identify the exact event type if present
        const webhookType = body.webhookType?.toString() || "";
        const eventName = body.eventName?.toString() || body.event?.toString() || "";
        const messageStatus = body.status?.toString() || "";

        // Let's identify the specific kind of the payload:
        const isDeliveryReport =
            webhookType === "3" /* Delivery/Status Event (assuming 3 based on structure, can vary) */ ||
            /* Known status event names */
            ['sent', 'delivered', 'read', 'failed'].includes(messageStatus.toLowerCase()) ||
            ['sent', 'delivered', 'read', 'failed'].includes(eventName.toLowerCase());

        // Explicit origin markers first — some MSG91 shapes carry a definitive
        // "sent by the business" flag; trust it over any phone-number heuristic.
        const explicitFromMe =
            body.fromMe === true || body.from_me === true ||
            body.isFromMe === true || body.is_from_me === true ||
            String(body.fromMe ?? body.from_me ?? "").toLowerCase() === "true";

        const isOutboundRequestReceived =
            webhookType === "2" ||
            (!isDeliveryReport && (body.direction === "outbound" || explicitFromMe));

        if (!senderPhone && !isDeliveryReport) {
            console.log("[MSG91 Webhook] No sender phone found. Payload keys:", Object.keys(body));
            // Ack 200 so MSG91 does not auto-pause the webhook on an unactionable payload.
            return NextResponse.json(
                { received: true, skipped: "no_sender_phone" },
                { status: 200 }
            );
        }

        // Normalize phone to digits only (formats drift: "+91…", "91-…", spaces)
        const normalizedPhone = digitsOnly(senderPhone);
        console.log(`[MSG91 Webhook] Processing message from ${normalizedPhone}`);

        // ─── Detect Business App Messages ────────────────────
        // MSG91 doesn't always send webhookType or direction for messages sent
        // from the WhatsApp Business App. Detection mechanisms:
        //   1. ANY sender-ish payload field matches an active integrated
        //      (business) number — tested individually, NOT just the first
        //      non-empty of the fallback chain: an echo can carry BOTH
        //      customerNumber (the customer) and from/sender (our number),
        //      and the chain alone would hide the business number.
        //   2. Body contains JSON with an MSG91-CDN attachment_url whose path
        //      carries a business number (media sent from the phone app).
        // Matching is variant-tolerant (digits-only, 10-digit-tail equality).
        let isSenderBusinessNumber = false;
        let businessNumbers: string[] = [];
        if (!isDeliveryReport) {
            const { data: activeNumbers } = await supabaseAdmin
                .from("integrated_numbers")
                .select("number")
                .eq("active", true);
            businessNumbers = (activeNumbers || []).map((r) => digitsOnly(r.number)).filter(Boolean);

            // Check 1: every sender-ish field, independently.
            const senderishFields = [normalizedPhone, body.from, body.sender, body.mobile, body.phone];
            for (const field of senderishFields) {
                const candidate = digitsOnly(field);
                if (candidate && businessNumbers.some((biz) => phonesMatch(candidate, biz))) {
                    isSenderBusinessNumber = true;
                    console.log(`[MSG91 Webhook] Business number detected in sender field: ${candidate}`);
                    break;
                }
            }

            // Check 2: MSG91 CDN URLs contain the business number:
            // /whatsapp-haptik-media/917090166111/...
            if (!isSenderBusinessNumber && messageBody) {
                try {
                    const parsed = typeof messageBody === "string" ? JSON.parse(messageBody) : null;
                    if (parsed?.attachment_url && typeof parsed.attachment_url === "string") {
                        const urlMatch = parsed.attachment_url.match(/\/(\d{10,15})\//);
                        if (urlMatch && businessNumbers.some((biz) => phonesMatch(digitsOnly(urlMatch[1]), biz))) {
                            isSenderBusinessNumber = true;
                            console.log(`[MSG91 Webhook] Business number detected from media URL: ${urlMatch[1]}`);
                        }
                    }
                } catch {
                    // Body isn't JSON, ignore
                }
            }

            if (isSenderBusinessNumber) {
                console.log(`[MSG91 Webhook] Sender ${normalizedPhone} is a known business number`);
            }
        }

        // ─── Handle Delivery Reports (Outbound Message Status) ───

        // This denotes if the webhook represents an outbound message initiated from *outside* our CRM
        let isExternalOutbound = isOutboundRequestReceived || isSenderBusinessNumber;

        if (isDeliveryReport) {
            // Determine actual status
            const finalStatus = (eventName || messageStatus).toLowerCase();
            if (externalId) {
                console.log(`[MSG91 Webhook] Processing delivery report for message ${externalId}: ${finalStatus}`);

                // Try to update the message status in our database
                // First try external_id, then fallback to request_id
                let updatedMsg: any[] | null = null;
                let updateError: any = null;

                const result1 = await supabaseAdmin
                    .from("messages")
                    .update({ status: finalStatus })
                    .eq("external_id", externalId)
                    .select("id");
                updatedMsg = result1.data;
                updateError = result1.error;

                // Fallback: try request_id for backward compatibility
                if (!updatedMsg || updatedMsg.length === 0) {
                    const result2 = await supabaseAdmin
                        .from("messages")
                        .update({ status: finalStatus })
                        .eq("request_id", externalId)
                        .select("id");
                    if (result2.data && result2.data.length > 0) {
                        updatedMsg = result2.data;
                        updateError = result2.error;
                    }
                }

                if (updateError) {
                    console.error("[MSG91 Webhook] Error updating message status:", updateError);
                }

                // If the message wasn't found in our DB, it means it was sent directly from the MSG91 app (external outbound)
                if ((!updatedMsg || updatedMsg.length === 0) && messageBody) {
                    console.log(`[MSG91 Webhook] Delivery report message not found in DB. Treating as external outbound message. body: ${messageBody}`);
                    isExternalOutbound = true;
                } else if (!updatedMsg || updatedMsg.length === 0) {
                    // No body, just a status for an unknown message. Ignore.
                    return NextResponse.json({ success: true, type: "delivery_report_unknown" });
                } else {
                    // Message was successfully updated
                    return NextResponse.json({ success: true, type: "delivery_report" });
                }
            } else if (messageBody) {
                // No externalId, but has body and is a sent event. Probably external outbound without ID.
                isExternalOutbound = true;
            } else {
                return NextResponse.json({ success: true, type: "delivery_report_no_id" });
            }
        }

        // Determine actual customer and business numbers based on direction
        let actualCustomerPhone = normalizedPhone;
        let actualBusinessPhone = receiverNumber;
        let messageDirection = "inbound";

        if (isExternalOutbound) {
            // MSG91 usually reports customerNumber = the customer and
            // integratedNumber = our business number, regardless of direction.
            // So normally do NOT swap customer/business — only flip the
            // direction. (An unconditional swap once created contacts under our
            // own number and conversations orphaned from every inbox.)
            messageDirection = "outbound";

            // EXCEPTION — echo shape with no customerNumber: the parsed
            // "customer" is OUR OWN number (it came from from/sender). Threading
            // under ourselves is always wrong; the real customer is on the
            // receiver side. Swap only in this provably-wrong case, and only
            // when the receiver is NOT also one of our numbers.
            const customerDigits = digitsOnly(actualCustomerPhone);
            if (customerDigits && businessNumbers.some((biz) => phonesMatch(customerDigits, biz))) {
                const receiverDigits = digitsOnly(receiverNumber);
                if (receiverDigits && !businessNumbers.some((biz) => phonesMatch(receiverDigits, biz))) {
                    actualBusinessPhone = actualCustomerPhone;
                    actualCustomerPhone = receiverDigits;
                    console.log(`[MSG91 Webhook] Echo shape: swapped — customer is receiver ${receiverDigits}`);
                } else {
                    console.log("[MSG91 Webhook] Echo with no resolvable customer (receiver is ours/empty); acknowledging.");
                    return NextResponse.json(
                        { received: true, skipped: "echo_no_customer" },
                        { status: 200 }
                    );
                }
            }

            console.log(`[MSG91 Webhook] Outbound message. Customer: ${actualCustomerPhone}, Business: ${actualBusinessPhone}`);

            if (!actualCustomerPhone) {
                console.log("[MSG91 Webhook] No customer phone for external outbound; acknowledging.");
                return NextResponse.json(
                    { received: true, skipped: "no_customer_phone" },
                    { status: 200 }
                );
            }
        } else {
            // Classified INBOUND — forensic one-liner so any future
            // misclassification (echo rendered as received) is diagnosable
            // from logs without guessing at MSG91's payload shape.
            console.log(
                `[MSG91 Webhook] direction=inbound wt=${webhookType || "-"} ev=${eventName || "-"} ` +
                `customerNumber=${digitsOnly(body.customerNumber) || "-"} from=${digitsOnly(body.from) || "-"} ` +
                `sender=${digitsOnly(body.sender) || "-"} mobile=${digitsOnly(body.mobile) || "-"} ` +
                `to=${digitsOnly(receiverNumber) || "-"} keys=${Object.keys(body).join(",")}`
            );
        }

        // ─── 1. Upsert Contact ─────────────────────────────
        // Single org — no org scoping (the column defaults to the single org).
        let { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("id, name")
            .eq("phone", actualCustomerPhone)
            .single();

        // Append-to-existing-only for outbound: a bulk outbound notification
        // (e.g. the swarg_credit_debit wallet template) to someone we've never
        // chatted with must NOT spawn a new contact/thread — that floods the
        // inbox. Real inbound still creates contacts + conversations below.
        if (!contact && isExternalOutbound) {
            console.log("[MSG91 Webhook] Outbound to unknown contact — not recording (append-to-existing-only).");
            return NextResponse.json({ received: true, skipped: "outbound_no_existing_contact" }, { status: 200 });
        }

        if (!contact) {
            const contactDisplayName = senderName || actualCustomerPhone;
            const { data: newContact, error: contactError } = await supabaseAdmin
                .from("contacts")
                .insert({
                    name: contactDisplayName,
                    phone: actualCustomerPhone,
                })
                .select("id, name")
                .single();

            if (contactError) {
                console.error("[MSG91 Webhook] Upsert contact error:", contactError);
                // Ack 200: a processing failure on our side must not auto-pause the MSG91 webhook.
                return NextResponse.json({ received: true, skipped: "contact_upsert_failed" }, { status: 200 });
            }
            contact = newContact;
            console.log(`[MSG91 Webhook] Created contact: ${contact!.id}`);
        } else if (senderName && isPlaceholderName(contact.name) && !isPlaceholderName(senderName)) {
            // Update contact name if we have a better one from the webhook
            await supabaseAdmin
                .from("contacts")
                .update({ name: senderName })
                .eq("id", contact.id);
            console.log(`[MSG91 Webhook] Updated contact name to "${senderName}"`);
        }

        // ─── CTWA Referral Detection ─────────────────────────
        // Check if the inbound message contains a CTWA referral (click-to-whatsapp ad)
        const referral = body.referral || body.context?.referral || null;
        const ctwaClid = referral?.ctwa_clid || referral?.ctwaid || null;
        const referralSourceId = referral?.source_id || referral?.ad_id || null;
        const referralSourceType = referral?.source_type || (ctwaClid ? "ad" : null);
        const referralSourceUrl = referral?.source_url || referral?.url || null;
        const referralHeadline = referral?.headline || referral?.head || null;
        const referralBody = referral?.body || referral?.description || null;
        const referralMediaType = referral?.media_type || null;
        const referralMediaUrl = referral?.media_url || referral?.image_url || null;

        if (ctwaClid) {
            console.log(`[MSG91 Webhook] CTWA referral detected. ctwa_clid: ${ctwaClid}, source_id: ${referralSourceId}`);
        }

        // ─── LMS: register a WhatsApp lead for new inbound senders ──────
        // Supabase-only + never throws, so it can't delay or break the 200 ack
        // (a slow ack makes MSG91 auto-pause the number).
        if (!isExternalOutbound && actualCustomerPhone && contact) {
            await maybeCreateWhatsAppLead({
                phone: actualCustomerPhone,
                name: senderName || contact.name,
                contactId: contact.id,
                ctwaClid,
            });
        }

        // ─── 2. Upsert Conversation ────────────────────────
        let { data: conversation } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .eq("contact_id", contact!.id)
            .eq("integrated_number", actualBusinessPhone || "default")
            .single();

        // Append-to-existing-only for outbound: don't open a new thread for an
        // outbound notification to a contact that has no conversation on this
        // number yet. Inbound falls through and creates the conversation.
        if (!conversation && isExternalOutbound) {
            console.log("[MSG91 Webhook] Outbound with no existing conversation — not recording (append-to-existing-only).");
            return NextResponse.json({ received: true, skipped: "outbound_no_existing_conversation" }, { status: 200 });
        }

        if (!conversation) {
            const convInsert: Record<string, unknown> = {
                contact_id: contact!.id,
                integrated_number: actualBusinessPhone || "default",
                status: "open",
                last_message: messageBody || "[media]",
                last_message_time: new Date().toISOString(),
                last_incoming_timestamp: isExternalOutbound ? undefined : new Date().toISOString(),
                unread_count: isExternalOutbound ? 0 : 1,
            };
            // Tag CTWA source on new conversations
            if (ctwaClid) {
                convInsert.ctwa_clid = ctwaClid;
                convInsert.source = "ctwa";
            }
            const { data: newConv, error: convError } = await supabaseAdmin
                .from("conversations")
                .insert(convInsert)
                .select("id")
                .single();

            if (convError) {
                console.error("[MSG91 Webhook] Create conversation error:", convError);
                return NextResponse.json({ received: true, skipped: "conversation_create_failed" }, { status: 200 });
            }
            conversation = newConv;
            console.log(`[MSG91 Webhook] Created conversation: ${conversation!.id}`);
        } else {
            // Update existing conversation
            const updatePayload: any = {
                status: "open",
                last_message: messageBody || "[media]",
                last_message_time: new Date().toISOString(),
            };
            if (!isExternalOutbound) {
                updatePayload.last_incoming_timestamp = new Date().toISOString();
            }

            await supabaseAdmin
                .from("conversations")
                .update(updatePayload)
                .eq("id", conversation.id);

            // Increment unread count only if inbound
            if (!isExternalOutbound) {
                const { data: convData } = await supabaseAdmin
                    .from("conversations")
                    .select("unread_count")
                    .eq("id", conversation.id)
                    .single();

                if (convData) {
                    await supabaseAdmin
                        .from("conversations")
                        .update({ unread_count: (convData.unread_count || 0) + 1 })
                        .eq("id", conversation.id);
                }
            }
        }

        // ─── Log CTWA referral ────────────────────────────
        if (ctwaClid && conversation) {
            // Also update existing conversation with CTWA source if not already set
            await supabaseAdmin
                .from("conversations")
                .update({ ctwa_clid: ctwaClid, source: "ctwa" })
                .eq("id", conversation.id)
                .is("ctwa_clid", null); // only if not already tagged

            const { error: logError } = await supabaseAdmin
                .from("ctwa_logs")
                .insert({
                    ctwa_clid: ctwaClid,
                    conversation_id: conversation.id,
                    contact_id: contact!.id,
                    source_id: referralSourceId,
                    source_type: referralSourceType,
                    source_url: referralSourceUrl,
                    headline: referralHeadline,
                    body: referralBody,
                    media_type: referralMediaType,
                    media_url: referralMediaUrl,
                });
            if (logError) {
                console.error("[MSG91 Webhook] CTWA log insert error:", logError);
            } else {
                console.log(`[MSG91 Webhook] CTWA log created for conversation ${conversation.id}`);
            }
        }

        // ─── Deduplication Check ─────────────────────────
        // MSG91 echoes back outbound messages as webhook events that look like
        // inbound messages. Check ALL conversations for this contact for a
        // recent outbound message with matching content (exact body or shared URL).
        if (contact?.id && messageBody) {
            const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();

            // Get all conversation IDs for this contact
            const { data: contactConvs } = await supabaseAdmin
                .from("conversations")
                .select("id")
                .eq("contact_id", contact.id);
            const contactConvIds = (contactConvs || []).map((c: { id: string }) => c.id);

            if (contactConvIds.length > 0) {
                // Check 1: Exact body match against recent outbound messages
                let dupMsg: { id: string } | null = null;
                const { data: exactMatch } = await supabaseAdmin
                    .from("messages")
                    .select("id")
                    .in("conversation_id", contactConvIds)
                    .eq("direction", "outbound")
                    .eq("body", messageBody)
                    .gte("created_at", twoMinutesAgo)
                    .limit(1)
                    .maybeSingle();
                dupMsg = exactMatch;

                // Check 2: URL-based match (for payment links where CRM stores
                // a compact body but MSG91 echoes the full text with the same URL)
                if (!dupMsg) {
                    const urls = messageBody.match(/https?:\/\/[^\s]+/g) || [];
                    for (const url of urls) {
                        const { data: urlMatch } = await supabaseAdmin
                            .from("messages")
                            .select("id")
                            .in("conversation_id", contactConvIds)
                            .eq("direction", "outbound")
                            .ilike("body", `%${url}%`)
                            .gte("created_at", twoMinutesAgo)
                            .limit(1)
                            .maybeSingle();
                        if (urlMatch) {
                            dupMsg = urlMatch;
                            break;
                        }
                    }
                }

                if (dupMsg) {
                    // Update the existing message's external_id for delivery report correlation
                    if (externalId) {
                        await supabaseAdmin
                            .from("messages")
                            .update({ external_id: externalId })
                            .eq("id", dupMsg.id);
                    }
                    console.log(`[MSG91 Webhook] Skipping duplicate message for contact ${contact.id} (matched msg ${dupMsg.id})`);
                    return NextResponse.json({ success: true, type: "duplicate_skipped" });
                }
            }
        }

        // ─── 3. Insert Message ─────────────────────────────

        // If it's a template payload or campaign, let's parse those properties
        const msgTemplateName = body.templateName || null;
        const msgCampaignName = body.campaignName || null;

        // If it's outbound, we want to represent it accurately
        let finalBody = messageBody;
        if (isExternalOutbound && !messageBody && msgTemplateName) {
            finalBody = `[Template: ${msgTemplateName}]`;
        }

        // Determine message source for sender icon differentiation
        let messageSource = "customer"; // default: inbound from customer
        if (ctwaClid && !isExternalOutbound) {
            messageSource = "ctwa"; // first message from a CTWA ad click
        } else if (isExternalOutbound) {
            if (msgCampaignName) {
                messageSource = "broadcast";
            } else if (isSenderBusinessNumber) {
                messageSource = "mobile_app"; // sent from WhatsApp Business mobile app
            } else {
                messageSource = "api"; // sent via MSG91 API from external system
            }
        }

        const insertPayload: any = {
            conversation_id: conversation!.id,
            direction: messageDirection,
            content_type: contentType === "contacts" ? "contact" : contentType, // Normalize 'contacts' to 'contact'
            body: finalBody,
            media_url: mediaUrl,
            file_name: fileName,
            template_name: msgTemplateName,
            status: isExternalOutbound ? "sent" : "delivered",
            source: messageSource,
        };

        if (locationData) {
            insertPayload.body = JSON.stringify({ text: messageBody, location: locationData });
        } else if (contactData) {
            insertPayload.body = JSON.stringify({ text: messageBody, contacts: contactData });
        }

        let { error: msgError } = await supabaseAdmin.from("messages").insert(insertPayload);

        // Fallback: an unexpected content_type (reaction/button/interactive/etc.) can violate a
        // DB CHECK constraint and fail the insert. Retry once as plain text so the message is still
        // captured rather than lost — and so we never 500 back to MSG91.
        if (msgError) {
            console.error("[MSG91 Webhook] Insert message error (retrying as text):", msgError);
            const retry = await supabaseAdmin
                .from("messages")
                .insert({ ...insertPayload, content_type: "text" });
            msgError = retry.error;
            if (msgError) {
                console.error("[MSG91 Webhook] Insert message retry failed:", msgError);
                return NextResponse.json({ received: true, skipped: "message_insert_failed" }, { status: 200 });
            }
        }

        console.log(`[MSG91 Webhook] Message saved for conversation ${conversation!.id}`);
        return NextResponse.json({ success: true, conversationId: conversation!.id });
    } catch (err) {
        // Always acknowledge with 200. A non-2xx here — even on a malformed payload — risks MSG91
        // auto-pausing the webhook and taking the entire inbound channel down. Log and move on.
        console.error("[MSG91 Webhook] Unhandled error (acknowledged to avoid webhook auto-pause):", err);
        return NextResponse.json({ received: true, error_logged: true }, { status: 200 });
    }
}
