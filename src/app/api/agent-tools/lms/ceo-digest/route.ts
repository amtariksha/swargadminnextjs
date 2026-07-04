/**
 * POST /api/agent-tools/lms/ceo-digest
 *
 * Body:
 *   { stats: { weekEnding, revenue7d, orders7d, newCustomers7d,
 *              subsStarted7d, subsStopped7d } }
 *
 * Weekly CEO digest, triggered by the backend's Monday ceo-digest cron with
 * deterministic 7-day business stats. This side:
 *   1. enriches with LMS stats (new leads, open pipeline, churn risk, top
 *      pending insight) — each best-effort,
 *   2. asks the lms-ceo-digest Agent Force agent for a one-line takeaway
 *      (prompt tunable in its UI; falls back to "—" so the digest always
 *      sends),
 *   3. sends the `ceo_weekly_digest` template (9 single-line body vars) to
 *      app_settings `ceo_digest_phone`,
 *   4. archives the digest as an lms_insights_feed row (kind weekly_digest)
 *      so it's readable on /lms/insights all week.
 *
 * Send failures are reported in the response (backend automation_run summary
 * surfaces them), not thrown.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { generateCeoDigestNote } from "@/lib/lms/agent-force/agents";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/send-template";
import { getAppSetting } from "@/lib/whatsapp/settings";
import { lmsAdmin } from "@/lib/lms/supabase";

export const maxDuration = 60;

const OPEN_STATUSES = ["new", "contacted", "qualified"];

const schema = z.object({
    stats: z.object({
        weekEnding: z.string().min(1),
        revenue7d: z.number(),
        orders7d: z.number(),
        newCustomers7d: z.number(),
        subsStarted7d: z.number(),
        subsStopped7d: z.number(),
    }),
});

/** Meta rejects template params containing newlines/tabs/4+ spaces. */
function sanitizeParam(value: string | number): string {
    const flat = String(value ?? "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    return flat.length > 150 ? `${flat.slice(0, 147)}...` : flat || "—";
}

async function countRows(
    table: string,
    build: (q: ReturnType<typeof lmsAdmin.from>) => unknown,
): Promise<number> {
    try {
        const query = lmsAdmin.from(table);
        const { count } = (await build(query)) as { count: number | null };
        return count ?? 0;
    } catch {
        return 0;
    }
}

async function lmsEnrichment() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const newLeads7d = await countRows("lms_leads", (q) =>
        q.select("id", { count: "exact", head: true }).gte("first_touch_at", sevenDaysAgo),
    );
    const openLeadsB2c = await countRows("lms_leads", (q) =>
        q.select("id", { count: "exact", head: true }).in("status", OPEN_STATUSES).eq("pipeline", "b2c"),
    );
    const openLeadsB2b = await countRows("lms_leads", (q) =>
        q.select("id", { count: "exact", head: true }).in("status", OPEN_STATUSES).eq("pipeline", "b2b"),
    );
    const churnHigh = await countRows("lms_health_scores", (q) =>
        q.select("customer_id", { count: "exact", head: true }).eq("churn_risk", "high"),
    );
    let topInsightTitle = "";
    try {
        const { data } = await lmsAdmin
            .from("lms_insights_feed")
            .select("title")
            .eq("state", "pending")
            .gt("expires_at", new Date().toISOString())
            .order("priority", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        topInsightTitle = data?.title ?? "";
    } catch {
        /* best-effort */
    }
    return { newLeads7d, openLeadsB2c, openLeadsB2b, churnHigh, topInsightTitle };
}

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return fail(`invalid body: ${JSON.stringify(parsed.error.flatten())}`, 400);
    }
    const { stats } = parsed.data;

    try {
        const to = await getAppSetting("ceo_digest_phone", "", ctx.orgId);
        if (!to) return ok({ skipped: "no_ceo_phone" });

        const lms = await lmsEnrichment();
        const aiNote =
            (await generateCeoDigestNote({ ...stats, ...lms }).catch(() => null)) ?? "—";

        const templateName =
            (await getAppSetting("ceo_digest_template_name", "", ctx.orgId)) ||
            "ceo_weekly_digest";
        const language =
            (await getAppSetting("ceo_digest_template_language", "", ctx.orgId)) || "en";

        const wa = await sendWhatsAppTemplate({
            to,
            templateName,
            language,
            bodyParams: [
                sanitizeParam(stats.weekEnding),
                sanitizeParam(stats.revenue7d.toLocaleString("en-IN")),
                sanitizeParam(stats.orders7d),
                sanitizeParam(stats.newCustomers7d),
                sanitizeParam(stats.subsStarted7d),
                sanitizeParam(stats.subsStopped7d),
                sanitizeParam(lms.newLeads7d),
                sanitizeParam(lms.churnHigh),
                sanitizeParam(aiNote),
            ],
            orgId: ctx.orgId,
        });

        // Archive on the insights feed (kind has no CHECK constraint; the
        // agent-facing write-insights-feed enum stays untouched).
        let archivedInsightId: string | null = null;
        try {
            const body = [
                `Revenue (7d): ₹${stats.revenue7d.toLocaleString("en-IN")} · Orders: ${stats.orders7d} · New customers: ${stats.newCustomers7d}`,
                `Subscriptions: +${stats.subsStarted7d} / -${stats.subsStopped7d}`,
                `New leads: ${lms.newLeads7d} · Open pipeline: B2C ${lms.openLeadsB2c} / B2B ${lms.openLeadsB2b} · High churn-risk: ${lms.churnHigh}`,
                lms.topInsightTitle ? `Top pending insight: ${lms.topInsightTitle}` : "",
                `AI takeaway: ${aiNote}`,
                wa.ok ? "" : `(WhatsApp send failed: ${wa.error})`,
            ]
                .filter(Boolean)
                .join("\n");
            const { data } = await lmsAdmin
                .from("lms_insights_feed")
                .insert({
                    org_id: ctx.orgId,
                    kind: "weekly_digest",
                    title: `Weekly CEO digest — week ending ${stats.weekEnding}`,
                    body,
                    priority: 2,
                    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
                })
                .select("id")
                .single();
            archivedInsightId = data?.id ?? null;
        } catch {
            /* archive is best-effort */
        }

        return ok({
            sent: wa.ok,
            waError: wa.error,
            aiNoteUsed: aiNote !== "—",
            archivedInsightId,
        });
    } catch (err) {
        return fail(err);
    }
}
