import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

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

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const query = supabaseAdmin
        .from("broadcast_campaigns")
        .select("*")
        .eq("id", id);

    const { data, error } = await query.maybeSingle();

    if (error || !data) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json(mapCampaign(data));
}
