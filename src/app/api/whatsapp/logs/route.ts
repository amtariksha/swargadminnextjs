import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

// ─── GET /api/logs ────────────────────────────────────────
// Fetch WhatsApp delivery logs from MSG91
export async function GET(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);

    // Resolve auth key: app_settings → organizations table → env var
    let authKey = await getAppSetting("msg91_auth_key", "", orgId);
    if (!authKey) {
        const { data: orgRow } = await supabaseAdmin
            .from("organizations")
            .select("msg91_auth_key")
            .eq("id", orgId)
            .maybeSingle();
        authKey = orgRow?.msg91_auth_key || process.env.MSG91_AUTH_KEY || "";
    }
    if (!authKey) {
        return NextResponse.json(
            { error: "MSG91 Auth Key not configured. Set it in Settings or as MSG91_AUTH_KEY env variable." },
            { status: 500 }
        );
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const phone = searchParams.get("phone") || "";
    const status = searchParams.get("status") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "25");

    try {
        // Build query params for MSG91 report logs API
        // MSG91 requires startDate/endDate in YYYY-MM-DD format, max 3 day range
        const params = new URLSearchParams();

        // Default to last 3 days if no dates provided
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const startDate = from || threeDaysAgo.toISOString().split("T")[0];
        const endDate = to || now.toISOString().split("T")[0];

        params.set("startDate", startDate);
        params.set("endDate", endDate);
        if (limit) params.set("limit", String(limit));

        const response = await fetch(
            `https://control.msg91.com/api/v5/report/logs/wa?${params.toString()}`,
            {
                method: "POST",
                headers: {
                    authkey: authKey,
                    accept: "application/json",
                },
            }
        );

        const responseText = await response.text();
        console.log("[Logs] MSG91 response status:", response.status);

        if (!response.ok) {
            return NextResponse.json(
                { error: "Failed to fetch logs from MSG91", details: responseText },
                { status: response.status }
            );
        }

        let data: any;
        try {
            data = JSON.parse(responseText);
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON response from MSG91" },
                { status: 502 }
            );
        }

        // Normalize the response — MSG91 report/logs/wa returns { data: [...], metadata: {...} }
        let rawLogs: any[] = [];
        let total = 0;

        if (Array.isArray(data)) {
            rawLogs = data;
            total = data.length;
        } else if (Array.isArray(data?.data)) {
            rawLogs = data.data;
            total = data.metadata?.totalCount || data.total || data.data.length;
        } else if (data?.data && typeof data.data === "object" && !Array.isArray(data.data)) {
            if (Array.isArray(data.data.logs)) {
                rawLogs = data.data.logs;
                total = data.data.total || rawLogs.length;
            }
        }

        // Client-side filtering by phone/status if provided
        let filteredLogs = rawLogs;
        if (phone) {
            const cleanPhone = phone.replace(/^\+/, "");
            filteredLogs = filteredLogs.filter(
                (log: any) => (log.customerNumber || "").includes(cleanPhone)
            );
        }
        if (status && status !== "all") {
            filteredLogs = filteredLogs.filter(
                (log: any) => (log.status || "").toLowerCase() === status.toLowerCase()
            );
        }

        // Map MSG91 report fields to our log format
        const logs = filteredLogs.map((log: any) => ({
            id: log.uuid || log.requestId || log.CRQID || String(Math.random()),
            phone: log.customerNumber || log.phone || log.recipient || "",
            direction: log.direction || "outbound",
            status: log.status || "unknown",
            contentType: log.messageType || log.content_type || "text",
            templateName: log.templateName || log.campaignName || undefined,
            sentAt: log.sentTime || log.requestedAt || "",
            deliveredAt: log.deliveryTime || undefined,
            readAt: log.readTime || undefined,
            credits: log.price || undefined,
            failureReason: log.failureReason || undefined,
            integratedNumber: log.integratedNumber || undefined,
        }));

        return NextResponse.json({
            logs,
            total,
            page,
            limit,
        });
    } catch (err) {
        console.error("[Logs] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch logs" },
            { status: 500 }
        );
    }
}
