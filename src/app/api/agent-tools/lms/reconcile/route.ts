/**
 * POST /api/agent-tools/lms/reconcile
 *
 * Nightly safety-net for the lead → customer lifecycle. The backend cron
 * (scripts/cron/lms-nightly.js) knows which phones are backend users and
 * whether they have any order; it POSTs that list here (token-gated) and the
 * admin — which owns the Supabase store — does the cross-DB linking:
 *
 *   • upsert the phone ↔ backend_user_id link in lms_unified_customers
 *   • flip any open WhatsApp lead for an ordered phone to 'converted'
 *
 * This backstops the real-time convert signal (a dropped fire-and-forget POST
 * is healed on the next run). Idempotent. The backend should page large
 * batches; we bulk-prefetch existing links so already-reconciled customers
 * are cheap no-ops.
 *
 * Body: { customers: Array<{ phone, backendUserId, hasOrder, name?, email? }> }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { lmsAdmin } from "@/lib/lms/supabase";
import { convertLeadByPhone } from "@/lib/lms/leads/service";
import { upsertUnifiedCustomer } from "@/lib/lms/unified/service";

export const maxDuration = 300;

// Lenient by design: this is a TRUSTED internal feed (the backend cron), not
// user input. The backend `users` table has plenty of junk in optional columns
// (non-email strings in `email`, formatted/odd phones), and zod array parsing
// is all-or-nothing — one strict-field failure would reject the whole nightly
// batch. So validate only what we actually depend on (a usable phone + a
// numeric id) and pass the rest through as opaque strings.
const schema = z.object({
    customers: z
        .array(
            z.object({
                phone: z.string().min(1).max(64),
                backendUserId: z.coerce.number().int().positive(),
                hasOrder: z.coerce.boolean(),
                name: z.string().optional(),
                email: z.string().optional(),
            }),
        )
        .max(5000),
});

function normalisePhone(input: string): string {
    return input.replace(/^\+/, "").replace(/\s+/g, "").trim();
}

const PREFETCH_PAGE = 1000;

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return fail("body must be { customers: [{ phone, backendUserId, hasOrder }] }", 400);
    }

    try {
        // ── Bulk prefetch so already-linked customers are no-ops. Paginated
        // so PostgREST's default 1000-row cap can't silently truncate the sets
        // (which would make the reconcile miss conversions at scale).
        const linkedPhones = new Set<string>();
        for (let from = 0; ; from += PREFETCH_PAGE) {
            const { data, error } = await lmsAdmin
                .from("lms_unified_customers")
                .select("phone, backend_user_id")
                .not("backend_user_id", "is", null)
                .range(from, from + PREFETCH_PAGE - 1);
            if (error) return fail(`unified prefetch failed: ${error.message}`);
            const rows = data ?? [];
            for (const r of rows) linkedPhones.add(normalisePhone(String(r.phone)));
            if (rows.length < PREFETCH_PAGE) break;
        }

        const openLeadPhones = new Set<string>();
        for (let from = 0; ; from += PREFETCH_PAGE) {
            const { data, error } = await lmsAdmin
                .from("lms_leads")
                .select("phone")
                .not("status", "in", "(converted,lost,duplicate)")
                .not("phone", "is", null)
                .range(from, from + PREFETCH_PAGE - 1);
            if (error) return fail(`open-lead prefetch failed: ${error.message}`);
            const rows = data ?? [];
            for (const r of rows) openLeadPhones.add(normalisePhone(String(r.phone)));
            if (rows.length < PREFETCH_PAGE) break;
        }

        let converted = 0;
        let linked = 0;
        let skipped = 0;
        let errors = 0;

        for (const c of parsed.data.customers) {
            const phone = normalisePhone(c.phone);
            if (!phone) {
                skipped += 1;
                continue;
            }
            const alreadyLinked = linkedPhones.has(phone);
            const hasOpenLead = openLeadPhones.has(phone);
            try {
                if (c.hasOrder && hasOpenLead) {
                    await convertLeadByPhone({
                        phone,
                        backendUserId: c.backendUserId,
                        name: c.name ?? null,
                        email: c.email ?? null,
                    });
                    converted += 1;
                } else if (!alreadyLinked) {
                    await upsertUnifiedCustomer({
                        phone,
                        backendUserId: c.backendUserId,
                        name: c.name ?? null,
                        email: c.email ?? null,
                    });
                    linked += 1;
                } else {
                    skipped += 1;
                }
            } catch (err) {
                console.error(
                    `[lms/reconcile] failed for ${phone}:`,
                    err instanceof Error ? err.message : err,
                );
                errors += 1;
            }
        }

        return ok({
            received: parsed.data.customers.length,
            converted,
            linked,
            skipped,
            errors,
        });
    } catch (err) {
        return fail(err);
    }
}
