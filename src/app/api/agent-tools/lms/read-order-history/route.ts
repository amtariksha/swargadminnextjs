/**
 * GET /api/agent-tools/lms/read-order-history?customerId=<uuid>&days=<int>
 *
 * Best-effort order history for one customer. Pulls from the backend MySQL
 * via the existing axios client when SWARG_BACKEND_URL is configured;
 * otherwise returns an empty list so the agent doesn't hard-fail.
 *
 * We DO NOT forward an admin Bearer token (the agent invocation isn't a
 * particular admin). Backend either has an open /get_order endpoint or
 * we accept the empty result. A dedicated backend service-account is the
 * proper fix and lives in Phase 2.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

const schema = z.object({
    customerId: z.string().uuid(),
    days: z.number().int().min(1).max(365).default(90),
});

export async function GET(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;
    const sp = new URL(request.url).searchParams;
    const parsed = schema.safeParse({
        customerId: sp.get("customerId"),
        days: sp.get("days") ? Number(sp.get("days")) : undefined,
    });
    if (!parsed.success) return fail("customerId required; days optional 1-365", 400);

    try {
        // Resolve phone from contacts (orders live in MySQL keyed by phone).
        const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("phone")
            .eq("org_id", ctx.orgId)
            .eq("id", parsed.data.customerId)
            .maybeSingle();
        const phone = contact?.phone as string | undefined;
        if (!phone) {
            return ok({
                customerId: parsed.data.customerId,
                phone: null,
                orders: [],
                note: "contact has no phone — cannot resolve backend orders",
            });
        }

        const backendUrl = process.env.SWARG_BACKEND_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
        if (!backendUrl) {
            return ok({
                customerId: parsed.data.customerId,
                phone,
                orders: [],
                note: "backend URL not configured — empty result",
            });
        }

        // Best-effort fetch. If the backend rejects the unauthenticated call,
        // we just return empty rather than crashing the agent.
        try {
            const since = new Date(
                Date.now() - parsed.data.days * 86_400_000,
            ).toISOString();
            const res = await fetch(
                `${backendUrl.replace(/\/$/, "")}/get_order?phone=${encodeURIComponent(phone)}&since=${encodeURIComponent(since)}`,
                { signal: AbortSignal.timeout(8000) },
            );
            if (!res.ok) {
                return ok({
                    customerId: parsed.data.customerId,
                    phone,
                    orders: [],
                    note: `backend ${res.status} ${res.statusText}`,
                });
            }
            const json = (await res.json()) as {
                data?: Array<Record<string, unknown>>;
            };
            return ok({
                customerId: parsed.data.customerId,
                phone,
                windowDays: parsed.data.days,
                orders: json.data ?? [],
            });
        } catch (err) {
            return ok({
                customerId: parsed.data.customerId,
                phone,
                orders: [],
                note: `backend fetch failed: ${err instanceof Error ? err.message : "unknown"}`,
            });
        }
    } catch (err) {
        return fail(err);
    }
}
