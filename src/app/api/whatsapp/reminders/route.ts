import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── GET /api/reminders ─────────────────────────────────────
export async function GET(request: NextRequest) {
    const { orgId, userId } = getRequestContext(request.headers);

    const { data, error } = await supabaseAdmin
        .from("reminders")
        .select("*, conversations(contact_id, contacts(name, phone))")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .neq("status", "dismissed")
        .order("due_at", { ascending: true });

    if (error) {
        console.error("Fetch reminders error:", error);
        return NextResponse.json([], { status: 200 });
    }

    const reminders = (data || []).map((r: Record<string, unknown>) => {
        const conv = r.conversations as Record<string, unknown> | null;
        const contact = conv?.contacts as Record<string, unknown> | null;
        return {
            id: r.id,
            conversationId: r.conversation_id,
            userId: r.user_id,
            remindAt: r.due_at,
            note: r.note || undefined,
            isDismissed: r.status === "dismissed",
            createdAt: r.created_at,
            contactName: contact?.name || "Unknown",
            contactPhone: contact?.phone || "",
        };
    });

    return NextResponse.json(reminders);
}

// ─── POST /api/reminders ────────────────────────────────────
export async function POST(request: NextRequest) {
    const { orgId, userId } = getRequestContext(request.headers);
    const body = await request.json();

    const { data, error } = await supabaseAdmin
        .from("reminders")
        .insert({
            conversation_id: body.conversationId,
            user_id: userId,
            due_at: body.remindAt,
            note: body.note || null,
            org_id: orgId,
            status: "active",
        })
        .select()
        .single();

    if (error) {
        console.error("Create reminder error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        id: data.id,
        conversationId: data.conversation_id,
        userId: data.user_id,
        remindAt: data.due_at,
        note: data.note || undefined,
        isDismissed: data.status === "dismissed",
        createdAt: data.created_at,
    }, { status: 201 });
}
