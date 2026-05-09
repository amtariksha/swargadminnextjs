import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

export async function GET(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    let query = supabaseAdmin
        .from("contacts")
        .select("name, phone, email, tags, created_at")
        .order("created_at", { ascending: false });

    if (!isSuperAdmin) {
        query = query.eq("organization_id", orgId);
    }

    if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
        console.error("[Contacts Export] Error:", error);
        return NextResponse.json({ error: "Failed to export contacts" }, { status: 500 });
    }

    const rows = data || [];

    // Build CSV
    const headers = "Name,Phone,Email,Tags,Created At";
    const csvRows = rows.map((row) => {
        const name = escapeCSV(row.name || "");
        const phone = escapeCSV(row.phone || "");
        const email = escapeCSV(row.email || "");
        const tags = escapeCSV(Array.isArray(row.tags) ? row.tags.join(", ") : "");
        const createdAt = row.created_at
            ? new Date(row.created_at).toLocaleDateString("en-IN")
            : "";
        return `${name},${phone},${email},${tags},${createdAt}`;
    });

    const csv = [headers, ...csvRows].join("\n");
    const today = new Date().toISOString().split("T")[0];

    return new NextResponse(csv, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="contacts-${today}.csv"`,
        },
    });
}

function escapeCSV(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
