import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── Supabase row → app Contact type mapper ───────────────
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

// ─── Supabase row → app Conversation type mapper ──────────
function mapConversation(row: Record<string, unknown>) {
    const rawContact =
        row.contacts && typeof row.contacts === "object"
            ? (row.contacts as Record<string, unknown>)
            : null;

    const contact = rawContact
        ? mapContact(rawContact)
        : { id: "", name: "Unknown", phone: "", tags: [] as string[], createdAt: "" };

    return {
        id: row.id as string,
        contactId: row.contact_id as string,
        contact: contact as { id: string; name: string; phone: string; email?: string; tags: string[]; createdAt: string },
        integratedNumber: row.integrated_number as string,
        status: row.status as string,
        assignedTo: (row.assigned_to as string) || undefined,
        assignedAt: (row.assigned_at as string) || undefined,
        lastMessage: (row.last_message as string) || "",
        lastMessageTime: row.last_message_time as string,
        lastIncomingTimestamp: (row.last_incoming_timestamp as string) || (row.last_message_time as string),
        unreadCount: (row.unread_count as number) || 0,
        messages: [] as Array<Record<string, unknown>>, // Messages loaded separately via [id] route
        ctwaClid: (row.ctwa_clid as string) || undefined,
        source: (row.source as string) || "organic",
    };
}

// ─── GET /api/conversations ────────────────────────────────
export async function GET(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.toLowerCase();
    const integratedNumber = searchParams.get("integratedNumber");

    let query = supabaseAdmin
        .from("conversations")
        .select("*, contacts(*)")
        .order("last_message_time", { ascending: false });

    if (!isSuperAdmin) {
        query = query.eq("org_id", orgId);
    }

    if (status && status !== "all") {
        query = query.eq("status", status);
    }

    // Per-number inbox: each business number has its own inbox route.
    if (integratedNumber) {
        query = query.eq("integrated_number", integratedNumber);
    }

    if (search) {
        // Search by contact name or phone — use contacts table filter
        query = query.or(
            `name.ilike.%${search}%,phone.ilike.%${search}%`,
            { foreignTable: "contacts" }
        );
    }

    const { data, error } = await query;

    if (error) {
        console.error("Supabase conversations error:", error);
        return NextResponse.json([], { status: 200 });
    }

    // When filtering by a foreign table in Supabase, rows where the inner join condition fails
    // return null for the joined object. We need to filter out rows where `contacts` is null.
    let results = (data || []).map(mapConversation);
    if (search) {
        results = results.filter((c) => c.contact.id !== "");
    }

    return NextResponse.json(results);
}

// ─── POST /api/conversations ───────────────────────────────
export async function POST(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const body = await request.json();

    const effectiveOrgId = isSuperAdmin && body.orgId ? body.orgId : orgId;

    // Resolve the business number this conversation belongs to. The per-number
    // inbox passes it explicitly; if it's missing, fall back to the org's first
    // active number rather than the old "919999999999" placeholder (which would
    // make the conversation invisible to every per-number inbox filter).
    let integratedNumber: string | null = body.integratedNumber || null;
    if (!integratedNumber) {
        const { data: firstNumber } = await supabaseAdmin
            .from("integrated_numbers")
            .select("number")
            .eq("org_id", effectiveOrgId)
            .eq("active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
        integratedNumber = firstNumber?.number || null;
    }

    const { data, error } = await supabaseAdmin
        .from("conversations")
        .insert({
            org_id: effectiveOrgId,
            contact_id: body.contactId,
            integrated_number: integratedNumber,
            status: "open",
            last_message: "",
            last_message_time: new Date().toISOString(),
            last_incoming_timestamp: new Date().toISOString(),
            unread_count: 0,
        })
        .select("*, contacts(*)")
        .single();

    if (error) {
        console.error("Create conversation error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(mapConversation(data), { status: 201 });
}
