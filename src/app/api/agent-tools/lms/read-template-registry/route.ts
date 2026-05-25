/**
 * GET /api/agent-tools/lms/read-template-registry?category=<UTILITY|MARKETING|AUTHENTICATION>
 *
 * Returns approved WhatsApp templates. The Compliance Guard agent uses this
 * to confirm the template's Meta-approved category matches the message's
 * intended purpose (spec §6.3 rule 4). Falls back to the entire registry
 * when no category filter is provided.
 *
 * Reads from the existing WACRM `templates` table in the public schema
 * (NOT app_lms — templates pre-existed the LMS).
 */

import { NextRequest } from "next/server";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

const ALLOWED_CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;
type Category = (typeof ALLOWED_CATEGORIES)[number];

export async function GET(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;
    const sp = new URL(request.url).searchParams;
    const category = sp.get("category") as Category | null;

    try {
        let q = supabaseAdmin
            .from("templates")
            .select("*")
            .eq("org_id", ctx.orgId);
        if (category && ALLOWED_CATEGORIES.includes(category)) {
            q = q.eq("category", category);
        }
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return ok({ category: category ?? "all", templates: data ?? [] });
    } catch (err) {
        return fail(err);
    }
}
