import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

// MSG91 template bulk API
const MSG91_API_BASE_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

// Recipient can be a plain phone string OR an object with per-recipient variables
type RecipientEntry = string | { phone: string; variables?: Record<string, string> };

function mapCampaign(row: Record<string, unknown>) {
    return {
        id: row.id as string,
        name: row.name as string,
        templateName: row.template_name as string,
        templateLanguage: row.template_language as string,
        integratedNumber: (row.integrated_number as string) || undefined,
        recipientsCount: Number(row.recipients_count) || 0,
        sentCount: Number(row.sent_count) || 0,
        deliveredCount: Number(row.delivered_count) || 0,
        readCount: Number(row.read_count) || 0,
        repliedCount: Number(row.replied_count) || 0,
        failedCount: Number(row.failed_count) || 0,
        status: row.status as string,
        csvFileName: (row.csv_file_name as string) || undefined,
        createdBy: (row.created_by as string) || undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// ─── GET /api/broadcast — List campaigns with summary ──────
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const days = searchParams.get("days");

    let query = supabaseAdmin
        .from("broadcast_campaigns")
        .select("*")
        .order("created_at", { ascending: false });

    if (status && status !== "all") {
        query = query.eq("status", status);
    }

    if (search) {
        query = query.or(`name.ilike.%${search}%,template_name.ilike.%${search}%`);
    }

    if (days && days !== "all") {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days, 10));
        query = query.gte("created_at", daysAgo.toISOString());
    }

    const { data, error } = await query;

    if (error) {
        console.error("[Broadcast API] Fetch error:", error);
        return NextResponse.json({
            campaigns: [],
            summary: { totalRecipients: 0, totalSent: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 },
        });
    }

    const campaigns = (data || []).map(mapCampaign);

    const summary = {
        totalRecipients: campaigns.reduce((s, c) => s + c.recipientsCount, 0),
        totalSent: campaigns.reduce((s, c) => s + c.sentCount, 0),
        totalDelivered: campaigns.reduce((s, c) => s + c.deliveredCount, 0),
        totalRead: campaigns.reduce((s, c) => s + c.readCount, 0),
        totalFailed: campaigns.reduce((s, c) => s + c.failedCount, 0),
    };

    return NextResponse.json({ campaigns, summary });
}

// ─── POST /api/broadcast — Send campaign + persist record ──
export async function POST(request: NextRequest) {
    try {
        const { orgId } = getRequestContext(request.headers);
        const body = await request.json();
        const { name, templateId, templateLanguage, variables, recipients, integratedNumber, csvFileName } = body;

        if (!templateId || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return NextResponse.json(
                { error: "Missing required fields (templateId, recipients) or recipients is empty" },
                { status: 400 }
            );
        }

        // Resolve auth key
        let MSG91_AUTH_KEY = await getAppSetting("msg91_auth_key", "", orgId);
        if (!MSG91_AUTH_KEY) {
            const { data: orgRow } = await supabaseAdmin
                .from("organizations")
                .select("msg91_auth_key")
                .eq("id", orgId)
                .maybeSingle();
            MSG91_AUTH_KEY = orgRow?.msg91_auth_key || process.env.MSG91_AUTH_KEY || "";
        }
        if (!MSG91_AUTH_KEY) {
            return NextResponse.json(
                { error: "MSG91 Auth Key not configured." },
                { status: 500 }
            );
        }

        // Resolve integrated number
        let sendFromNumber = integratedNumber;
        if (!sendFromNumber || sendFromNumber === "default") {
            const { data: fallbackNum } = await supabaseAdmin
                .from("integrated_numbers")
                .select("number")
                .eq("active", true)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();

            if (fallbackNum) {
                sendFromNumber = fallbackNum.number;
            }
        }

        if (!sendFromNumber) {
            return NextResponse.json(
                { error: "No integrated number configured." },
                { status: 400 }
            );
        }

        // Auto-generate campaign name if not provided
        const campaignName = name || new Date().toLocaleDateString("en-IN", {
            day: "2-digit", month: "short", year: "2-digit",
            hour: "2-digit", minute: "2-digit", hour12: true,
        });

        // Insert campaign record before sending
        const { data: campaign, error: insertErr } = await supabaseAdmin
            .from("broadcast_campaigns")
            .insert({
                name: campaignName,
                template_name: templateId,
                template_language: templateLanguage || "en",
                integrated_number: sendFromNumber,
                recipients_count: recipients.length,
                csv_file_name: csvFileName || null,
                status: "sending",
            })
            .select()
            .single();

        if (insertErr) {
            console.error("[Broadcast API] Campaign insert error:", insertErr);
            return NextResponse.json({ error: "Failed to create campaign record" }, { status: 500 });
        }

        // Build per-recipient to_and_components
        const toAndComponents = (recipients as RecipientEntry[]).map((entry) => {
            const phone = typeof entry === "string" ? entry : entry.phone;
            const recipientVars = typeof entry === "object" && entry.variables
                ? entry.variables
                : variables || {};

            const sortedKeys = Object.keys(recipientVars).sort();
            const components: Record<string, { type: string; value: string }> = {};

            sortedKeys.forEach((key, idx) => {
                components[`body_${idx + 1}`] = {
                    type: "text",
                    value: recipientVars[key],
                };
            });

            return { to: [phone], components };
        });

        // MSG91 payload
        const payload = {
            integrated_number: sendFromNumber,
            content_type: "template",
            payload: {
                messaging_product: "whatsapp",
                type: "template",
                template: {
                    name: templateId,
                    language: { code: templateLanguage || "en" },
                    to_and_components: toAndComponents,
                },
            },
        };

        console.log(`[Broadcast API] Sending campaign ${campaign.id} to ${toAndComponents.length} recipients`);

        const response = await fetch(MSG91_API_BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                authkey: MSG91_AUTH_KEY,
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok || data.hasError) {
            console.error("[Broadcast API] MSG91 Error:", data);
            // Update campaign as failed
            await supabaseAdmin
                .from("broadcast_campaigns")
                .update({ status: "failed", msg91_response: data, updated_at: new Date().toISOString() })
                .eq("id", campaign.id);

            return NextResponse.json(
                { error: data.message || data.errors || "Failed to send broadcast via MSG91" },
                { status: 400 }
            );
        }

        // Update campaign as completed
        await supabaseAdmin
            .from("broadcast_campaigns")
            .update({
                status: "completed",
                sent_count: recipients.length,
                msg91_response: data,
                updated_at: new Date().toISOString(),
            })
            .eq("id", campaign.id);

        console.log(`[Broadcast API] Campaign ${campaign.id} completed. Sent to ${toAndComponents.length} recipients.`);
        return NextResponse.json(mapCampaign({
            ...campaign,
            status: "completed",
            sent_count: recipients.length,
        }));

    } catch (error: any) {
        console.error("[Broadcast API] Internal error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
