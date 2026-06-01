import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

// ─── GET /api/ctwa/logs ──────────────────────────────────────
// Returns CTWA click/conversation logs with optional filters
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const campaign = searchParams.get("campaign");
    const conversationId = searchParams.get("conversationId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
        .from("ctwa_logs")
        .select(`
            *,
            contacts!ctwa_logs_contact_id_fkey(name, phone),
            conversations!ctwa_logs_conversation_id_fkey(status)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (from) {
        query = query.gte("created_at", from);
    }
    if (to) {
        query = query.lte("created_at", to);
    }
    if (campaign) {
        query = query.eq("campaign_name", campaign);
    }
    if (conversationId) {
        query = query.eq("conversation_id", conversationId);
    }

    const { data, count, error } = await query;

    if (error) {
        console.error("[CTWA Logs] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const logs = (data || []).map((log: Record<string, unknown>) => {
        const contact = log.contacts as Record<string, unknown> | null;
        const conversation = log.conversations as Record<string, unknown> | null;
        return {
            id: log.id,
            ctwaClid: log.ctwa_clid,
            conversationId: log.conversation_id,
            contactId: log.contact_id,
            sourceId: log.source_id,
            sourceType: log.source_type,
            sourceUrl: log.source_url,
            headline: log.headline,
            body: log.body,
            mediaType: log.media_type,
            mediaUrl: log.media_url,
            adName: log.ad_name,
            campaignName: log.campaign_name,
            createdAt: log.created_at,
            contactName: contact?.name || null,
            contactPhone: contact?.phone || null,
            conversationStatus: conversation?.status || null,
        };
    });

    return NextResponse.json({
        logs,
        total: count || 0,
        page,
        limit,
    });
}
