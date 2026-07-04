/**
 * POST /api/agent-tools/lms/sales-nudge
 *
 * Body:
 *   { users: [{ id, name, phone }] }   ← the backend's staff roster
 *
 * Daily "your 10 hottest leads" nudge, triggered by the backend's 08:00
 * daily-sales-nudge cron. Lead owners are stored here as
 * String(backend users.id), but only the backend knows their phones — so it
 * pushes the roster and this side groups open leads per owner, ranks by
 * score, and sends the `sales_nudge` template (3 single-line body vars:
 * first name, open-lead count, top-3 "Name (score)" list) to each owner.
 *
 * Deterministic — no LLM. Owners without a matching roster entry or phone
 * are tallied in `skipped`; send failures in `failed`. Never throws per-send.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/send-template";
import { getAppSetting } from "@/lib/whatsapp/settings";
import { lmsAdmin } from "@/lib/lms/supabase";

export const maxDuration = 60;

const OPEN_STATUSES = ["new", "contacted", "qualified"];
const TOP_PER_OWNER = 10;

const schema = z.object({
    users: z
        .array(
            z.object({
                id: z.number().int(),
                name: z.string(),
                phone: z.string().min(6),
            }),
        )
        .min(1),
});

interface LeadRow {
    id: string;
    name: string | null;
    phone: string | null;
    score: number | null;
    owner_user_id: string | null;
}

function sanitizeParam(value: string | number): string {
    const flat = String(value ?? "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    return flat.length > 150 ? `${flat.slice(0, 147)}...` : flat || "—";
}

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return fail(`invalid body: ${JSON.stringify(parsed.error.flatten())}`, 400);
    }
    const roster = new Map(parsed.data.users.map((u) => [String(u.id), u]));

    try {
        const { data, error } = await lmsAdmin
            .from("lms_leads")
            .select("id, name, phone, score, owner_user_id")
            .in("status", OPEN_STATUSES)
            .not("owner_user_id", "is", null)
            .order("score", { ascending: false, nullsFirst: false })
            .limit(1000);
        if (error) throw new Error(error.message);
        const leads = (data ?? []) as LeadRow[];

        // Rows arrive score-desc, so per-owner insertion order IS hotness order.
        const byOwner = new Map<string, LeadRow[]>();
        for (const lead of leads) {
            const owner = lead.owner_user_id as string;
            const bucket = byOwner.get(owner) ?? [];
            if (bucket.length < TOP_PER_OWNER) bucket.push(lead);
            byOwner.set(owner, bucket);
        }
        // Count ALL open leads per owner (bucket is capped at 10).
        const totals = new Map<string, number>();
        for (const lead of leads) {
            const owner = lead.owner_user_id as string;
            totals.set(owner, (totals.get(owner) ?? 0) + 1);
        }

        const templateName =
            (await getAppSetting("sales_nudge_template_name", "", ctx.orgId)) ||
            "sales_nudge";
        const language =
            (await getAppSetting("sales_nudge_template_language", "", ctx.orgId)) || "en";

        let sent = 0;
        let failed = 0;
        const skipped = { noStaffMatch: 0, noPhone: 0 };
        const errors: string[] = [];

        for (const [owner, top] of byOwner) {
            const user = roster.get(owner);
            if (!user) {
                skipped.noStaffMatch += 1;
                continue;
            }
            if (!user.phone) {
                skipped.noPhone += 1;
                continue;
            }
            const firstName = (user.name || "there").split(/\s+/)[0];
            const topList = top
                .slice(0, 3)
                .map((l) => `${l.name || l.phone || "Lead"} (${l.score ?? "–"})`)
                .join(", ");
            const wa = await sendWhatsAppTemplate({
                to: user.phone,
                templateName,
                language,
                bodyParams: [
                    sanitizeParam(firstName),
                    sanitizeParam(totals.get(owner) ?? top.length),
                    sanitizeParam(topList),
                ],
                orgId: ctx.orgId,
            });
            if (wa.ok) {
                sent += 1;
            } else {
                failed += 1;
                if (errors.length < 5) errors.push(`${owner}: ${wa.error}`);
            }
        }

        return ok({ owners: byOwner.size, sent, failed, skipped, errors });
    } catch (err) {
        return fail(err);
    }
}
