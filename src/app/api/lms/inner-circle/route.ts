/**
 * GET /api/lms/inner-circle — list current members (with contact name/phone).
 */

import { NextRequest, NextResponse } from "next/server";
import { listInnerCircle } from "@/lib/lms/referrals/service";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

export async function GET(_request: NextRequest) {
    try {
        const members = await listInnerCircle();
        if (members.length === 0) {
            return NextResponse.json({ count: 0, members: [] });
        }
        // Enrich with contact info — small set, one query.
        const ids = members.map((m) => m.customerId);
        const { data: contacts } = await supabaseAdmin
            .from("contacts")
            .select("id, name, phone")
            .in("id", ids);
        const contactMap = new Map<string, { name?: string; phone?: string }>();
        for (const c of contacts ?? []) {
            contactMap.set(c.id as string, {
                name: c.name as string,
                phone: c.phone as string,
            });
        }
        const enriched = members.map((m) => ({
            ...m,
            contactName: contactMap.get(m.customerId)?.name ?? null,
            contactPhone: contactMap.get(m.customerId)?.phone ?? null,
        }));
        return NextResponse.json({ count: enriched.length, members: enriched });
    } catch (err) {
        console.error("[GET /api/lms/inner-circle]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
