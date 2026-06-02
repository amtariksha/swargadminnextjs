/**
 * Marketing/transactional send pipeline — the ONE path every LMS WhatsApp
 * template send goes through (journeys today, campaigns in Phase 2).
 *
 * Order of gates (all enforced in code — deterministic, not agent-dependent):
 *   1. Consent      — skip if the customer hasn't granted the required purpose.
 *   2. Frequency cap — marketing only: ≤ 2 mkt_* sends per customer per rolling
 *                      7 days, counted from the lms_campaign_messages ledger.
 *   3. Quiet hours   — marketing only: defer to next 08:00 IST (returns a
 *                      deferUntil; the caller reschedules — we never drop it).
 *   4. 2-number route — txn_* → Number 1, mkt_* → Number 2 (router.ts), then
 *                      resolve the slot to a real integrated_number by
 *                      routing_role (migration 010), falling back to the first
 *                      active number on a single-number deploy.
 *   5. Send via MSG91 + write a lms_campaign_messages delivery row (the ledger
 *      that backs the frequency cap AND the `received_campaign_within_days`
 *      segment filter).
 *
 * Compliance Guard (the AI agent) reviews a whole recipient set at CAMPAIGN
 * granularity (Phase 2, once per send), not per individual journey tick — a
 * 15 s agent call per message would be untenable. For per-customer journey
 * sends, the deterministic gates above ARE the live compliance enforcement.
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { ORG_ID } from "@/lib/whatsapp/request";
import { hasConsent } from "@/lib/lms/consent/service";
import { routeSend, type Purpose, type RoutedNumber } from "@/lib/whatsapp/router";
import { getAppSetting } from "@/lib/whatsapp/settings";
import type { ConsentPurpose } from "@/lib/lms/types";

const MSG91_BULK_URL =
    "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

/** Marketing messages per customer per rolling 7 days (owner-set policy). */
const MARKETING_CAP_PER_7D = 2;

/** Quiet hours (IST) — no marketing sends from 21:00 up to 08:00. */
const QUIET_START_HOUR_IST = 21;
const QUIET_END_HOUR_IST = 8;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type DispatchStatus =
    | "sent"
    | "skipped_consent"
    | "skipped_cap"
    | "deferred_quiet_hours"
    | "failed";

export interface DispatchResult {
    status: DispatchStatus;
    reason?: string;
    /** ISO timestamp to retry at, set only when status = deferred_quiet_hours. */
    deferUntil?: string;
    providerMsgId?: string;
}

export interface DispatchArgs {
    customerId: string;
    templateName: string;
    templateLanguage?: string;
    purpose: Purpose;
    params?: Record<string, string>;
    requiresConsent: ConsentPurpose;
    /** Trace the resulting ledger row back to its journey run / campaign. */
    journeyRunId?: string;
    campaignId?: string;
}

export async function dispatchTemplateSend(
    args: DispatchArgs,
): Promise<DispatchResult> {
    const isMarketing = args.purpose.startsWith("mkt_");

    // 1. Consent.
    const granted = await hasConsent({
        customerId: args.customerId,
        purpose: args.requiresConsent,
    });
    if (!granted) {
        await logLedger(args, "skipped_consent", `no_consent_${args.requiresConsent}`);
        return { status: "skipped_consent", reason: `no_consent_${args.requiresConsent}` };
    }

    // 2. Frequency cap — marketing only.
    if (isMarketing) {
        const capped = await isFrequencyCapped(args.customerId);
        if (capped) {
            await logLedger(args, "skipped_cap", `cap_${MARKETING_CAP_PER_7D}_per_7d`);
            return { status: "skipped_cap", reason: `cap_${MARKETING_CAP_PER_7D}_per_7d` };
        }
    }

    // 3. Quiet hours — marketing only. Defer, never drop.
    if (isMarketing) {
        const deferUntil = computeQuietHoursDefer();
        if (deferUntil) return { status: "deferred_quiet_hours", deferUntil };
    }

    // 4. Routing → real number.
    let slot: RoutedNumber;
    try {
        ({ number: slot } = await routeSend({ orgId: ORG_ID, purpose: args.purpose }));
    } catch (err) {
        const reason = errMsg(err);
        await logLedger(args, "failed", reason);
        return { status: "failed", reason };
    }
    const integratedNumber = await resolveNumber(slot);
    if (!integratedNumber) {
        await logLedger(args, "failed", "no_integrated_number");
        return { status: "failed", reason: "no_integrated_number" };
    }

    // 5. Recipient phone.
    const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("phone")
        .eq("id", args.customerId)
        .maybeSingle();
    const phone = contact?.phone ? String(contact.phone) : "";
    if (!phone) {
        await logLedger(args, "failed", "no_phone");
        return { status: "failed", reason: "no_phone" };
    }

    // 6. Send via MSG91.
    const authKey = await getAppSetting(
        "msg91_auth_key",
        process.env.MSG91_AUTH_KEY ?? "",
        ORG_ID,
    );
    if (!authKey) {
        await logLedger(args, "failed", "no_msg91_auth_key");
        return { status: "failed", reason: "no_msg91_auth_key" };
    }

    const payload = {
        integrated_number: integratedNumber,
        content_type: "template",
        payload: {
            messaging_product: "whatsapp",
            type: "template",
            template: {
                name: args.templateName,
                language: { code: args.templateLanguage ?? "en" },
                to_and_components: [
                    { to: [phone], components: buildComponents(args.params ?? {}) },
                ],
            },
        },
    };

    try {
        const res = await fetch(MSG91_BULK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", authkey: authKey },
            body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || data.hasError) {
            const reason = String(data.message ?? data.errors ?? `http_${res.status}`);
            await logLedger(args, "failed", reason);
            return { status: "failed", reason };
        }
        const providerMsgId = extractMsgId(data);
        await logLedger(args, "sent", undefined, providerMsgId);
        return { status: "sent", providerMsgId };
    } catch (err) {
        const reason = errMsg(err);
        await logLedger(args, "failed", reason);
        return { status: "failed", reason };
    }
}

// ─── Gates / helpers ────────────────────────────────────────────────────────

async function isFrequencyCapped(customerId: string): Promise<boolean> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await lmsAdmin
        .from("lms_campaign_messages")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId)
        .like("purpose", "mkt_%")
        .gte("sent_at", since);
    if (error) {
        // Fail-open on a count error rather than silently dropping the send;
        // the consent gate already passed and over-sending one message is a
        // smaller harm than a broken count blocking all marketing.
        console.warn("[dispatch] frequency-cap count failed:", error.message);
        return false;
    }
    return (count ?? 0) >= MARKETING_CAP_PER_7D;
}

/** Returns an ISO retry time if we're inside quiet hours, else null. */
function computeQuietHoursDefer(): string | null {
    const istMs = Date.now() + IST_OFFSET_MS;
    const ist = new Date(istMs);
    const hour = ist.getUTCHours();
    const inQuiet = hour >= QUIET_START_HOUR_IST || hour < QUIET_END_HOUR_IST;
    if (!inQuiet) return null;

    // Next 08:00 IST.
    const target = new Date(istMs);
    target.setUTCHours(QUIET_END_HOUR_IST, 0, 0, 0);
    if (target.getTime() <= istMs) {
        target.setUTCDate(target.getUTCDate() + 1);
    }
    return new Date(target.getTime() - IST_OFFSET_MS).toISOString();
}

/** Map a routing slot ("1"/"2") to a real integrated_number string. */
async function resolveNumber(slot: RoutedNumber): Promise<string | null> {
    const role = slot === "1" ? "transactional" : "marketing";
    const { data } = await supabaseAdmin
        .from("integrated_numbers")
        .select("number")
        .eq("routing_role", role)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
    if (data?.number) return String(data.number);

    // Fallback: roles not set yet (or single-number deploy) → first active.
    const { data: fallback } = await supabaseAdmin
        .from("integrated_numbers")
        .select("number")
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
    if (fallback?.number) {
        console.warn(
            `[dispatch] no '${role}' integrated_number — falling back to first active. Set integrated_numbers.routing_role (migration 010).`,
        );
        return String(fallback.number);
    }
    return null;
}

/** MSG91 to_and_components body vars: body_1, body_2… in sorted key order. */
function buildComponents(
    vars: Record<string, string>,
): Record<string, { type: string; value: string }> {
    const components: Record<string, { type: string; value: string }> = {};
    Object.keys(vars)
        .sort()
        .forEach((key, idx) => {
            components[`body_${idx + 1}`] = { type: "text", value: vars[key] };
        });
    return components;
}

async function logLedger(
    args: DispatchArgs,
    status: DispatchStatus,
    failureReason?: string,
    providerMsgId?: string,
): Promise<void> {
    try {
        await lmsAdmin.from("lms_campaign_messages").insert({
            campaign_id: args.campaignId ?? null,
            journey_run_id: args.journeyRunId ?? null,
            customer_id: args.customerId,
            channel: "whatsapp",
            purpose: args.purpose,
            template_name: args.templateName,
            status,
            // Only "sent" rows carry sent_at, so only real sends count toward
            // the frequency cap + the received_campaign_within_days filter.
            sent_at: status === "sent" ? new Date().toISOString() : null,
            provider_msg_id: providerMsgId ?? null,
            failure_reason: failureReason ?? null,
        });
    } catch (err) {
        console.error("[dispatch] ledger insert failed (send proceeded):", errMsg(err));
    }
}

function extractMsgId(data: Record<string, unknown>): string | undefined {
    // MSG91 bulk responses vary; probe the common shapes, else leave undefined.
    const d = data as {
        data?: { messages?: Array<{ message_id?: string }> } | Array<{ message_id?: string }>;
        message_id?: string;
        request_id?: string;
    };
    if (typeof d.message_id === "string") return d.message_id;
    if (typeof d.request_id === "string") return d.request_id;
    if (Array.isArray(d.data) && d.data[0]?.message_id) return d.data[0].message_id;
    if (!Array.isArray(d.data) && d.data?.messages?.[0]?.message_id) {
        return d.data.messages[0].message_id;
    }
    return undefined;
}

function errMsg(err: unknown): string {
    return err instanceof Error ? err.message : "unknown_error";
}
