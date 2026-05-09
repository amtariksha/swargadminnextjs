import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

function mapMessage(row: Record<string, unknown>) {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        direction: row.direction,
        contentType: row.content_type || "text",
        body: row.body || "",
        mediaUrl: row.media_url || undefined,
        fileName: row.file_name || undefined,
        status: row.status || "sent",
        isInternalNote: row.is_internal_note || false,
        timestamp: row.created_at,
        source: row.source || undefined,
    };
}

function mapContact(row: Record<string, unknown>) {
    return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email || undefined,
        tags: row.tags || [],
        customFields: row.custom_fields || {},
        createdAt: row.created_at,
    };
}

// ─── GET /api/conversations/[id] ──────────────────────────
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { id } = await params;

    // Fetch conversation with contact and assigned user
    let convQuery = supabaseAdmin
        .from("conversations")
        .select("*, contacts(*)")
        .eq("id", id);

    if (!isSuperAdmin) {
        convQuery = convQuery.eq("org_id", orgId);
    }

    const { data: conv, error: convError } = await convQuery.single();

    if (convError || !conv) {
        return NextResponse.json(
            { error: "Conversation not found" },
            { status: 404 }
        );
    }

    // Fetch assigned user info if assigned
    let assignedUser = undefined;
    if (conv.assigned_to) {
        const { data: user } = await supabaseAdmin
            .from("users")
            .select("id, name")
            .eq("id", conv.assigned_to)
            .single();
        if (user) {
            assignedUser = { id: user.id, name: user.name };
        }
    }

    // Fetch messages for this conversation (org-scoped)
    let msgQuery = supabaseAdmin
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

    if (!isSuperAdmin) {
        msgQuery = msgQuery.eq("org_id", orgId);
    }

    const { data: messages } = await msgQuery;

    const contact =
        conv.contacts && typeof conv.contacts === "object"
            ? mapContact(conv.contacts as Record<string, unknown>)
            : { id: "", name: "Unknown", phone: "", tags: [], createdAt: "" };

    const result = {
        id: conv.id,
        contactId: conv.contact_id,
        contact,
        integratedNumber: conv.integrated_number,
        status: conv.status,
        assignedTo: conv.assigned_to || undefined,
        assignedAt: conv.assigned_at || undefined,
        assignedUser,
        lastMessage: conv.last_message || "",
        lastMessageTime: conv.last_message_time,
        lastIncomingTimestamp:
            conv.last_incoming_timestamp || conv.last_message_time,
        unreadCount: conv.unread_count || 0,
        messages: (messages || []).map(mapMessage),
        ctwaClid: conv.ctwa_clid || undefined,
        source: conv.source || "organic",
    };

    return NextResponse.json(result);
}

// ─── PATCH /api/conversations/[id] ────────────────────────
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.status) updateData.status = body.status;
    if (body.unreadCount !== undefined) updateData.unread_count = body.unreadCount;

    // Handle assignment
    if (body.assigned_to !== undefined) {
        updateData.assigned_to = body.assigned_to;
        updateData.assigned_at = body.assigned_to ? new Date().toISOString() : null;
    }

    let updateQuery = supabaseAdmin
        .from("conversations")
        .update(updateData)
        .eq("id", id);

    if (!isSuperAdmin) {
        updateQuery = updateQuery.eq("org_id", orgId);
    }

    const { data, error } = await updateQuery
        .select("*, contacts(*)")
        .single();

    if (error || !data) {
        return NextResponse.json(
            { error: "Failed to update conversation" },
            { status: 500 }
        );
    }

    // Fetch assigned user info
    let assignedUser = undefined;
    if (data.assigned_to) {
        const { data: user } = await supabaseAdmin
            .from("users")
            .select("id, name")
            .eq("id", data.assigned_to)
            .single();
        if (user) {
            assignedUser = { id: user.id, name: user.name };
        }
    }

    const contact =
        data.contacts && typeof data.contacts === "object"
            ? mapContact(data.contacts as Record<string, unknown>)
            : { id: "", name: "Unknown", phone: "", tags: [], createdAt: "" };

    return NextResponse.json({
        id: data.id,
        contactId: data.contact_id,
        contact,
        integratedNumber: data.integrated_number,
        status: data.status,
        assignedTo: data.assigned_to || undefined,
        assignedAt: data.assigned_at || undefined,
        assignedUser,
        lastMessage: data.last_message || "",
        lastMessageTime: data.last_message_time,
        lastIncomingTimestamp:
            data.last_incoming_timestamp || data.last_message_time,
        unreadCount: data.unread_count || 0,
        messages: [],
        ctwaClid: data.ctwa_clid || undefined,
        source: data.source || "organic",
    });
}
