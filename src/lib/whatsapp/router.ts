/**
 * 2-Number Routing — the highest-risk integration in the WACRM merge.
 *
 * Spec reference: requirements §7.
 *
 * The rule that must never be broken:
 *   Number 1 = TRANSACTIONAL ONLY (order confirmations, OTPs, delivery, support).
 *              Quality rating is sacred; high engagement, low volume.
 *   Number 2 = MARKETING ONLY (broadcasts, win-backs, festival pre-orders, etc.).
 *              Higher tolerance for opt-outs and rating drops.
 *
 * A transactional message sent via Number 2 → fine but wrong number.
 * A marketing message sent via Number 1 → can degrade Number 1's Meta quality
 *   rating and degrade ALL transactional traffic, including OTPs. Existential
 *   risk for the platform.
 *
 * This module:
 *   1. Exposes purpose → number routing via pickNumber().
 *   2. Provides a writeAudit() helper that every outbound message MUST call.
 *   3. Throws on mismatched purpose/number combos so the failure is loud.
 */

import { lmsAdmin } from "@/lib/lms/supabase";

// ─── Purpose taxonomy ─────────────────────────────────────────────────────

/**
 * Every outbound WhatsApp send across the LMS + WACRM must carry one of
 * these purpose codes. Convention: `txn_*` = transactional / `mkt_*` = marketing.
 * Match the spec §7.2 table; extend here when adding a new send path.
 */
export type Purpose =
    // Transactional (Number 1) — UTILITY or AUTHENTICATION template categories
    | "txn_order_confirmation"
    | "txn_delivery_update"
    | "txn_delivery_done"
    | "txn_payment_receipt"
    | "txn_otp"
    | "txn_feedback_request"
    | "txn_support_reply"
    | "txn_welcome_d0"            // first-order welcome — UTILITY, attached to order
    // Marketing (Number 2) — MARKETING template category required by Meta
    | "mkt_welcome_d2"            // welcome series Day 2+
    | "mkt_replenishment"
    | "mkt_winback_d30"
    | "mkt_winback_d60"
    | "mkt_winback_d90"
    | "mkt_festival_preorder"
    | "mkt_crosssell_bridge"
    | "mkt_broadcast"
    | "mkt_back_in_stock"
    | "mkt_inner_circle_touch"
    | "mkt_referral_reminder"
    | "mkt_review_request";        // post-feedback Google review prompt

export type RoutedNumber = "1" | "2";

const TXN_PREFIX = "txn_";
const MKT_PREFIX = "mkt_";

/**
 * Resolve which number a given purpose must go through. Throws if the
 * purpose code isn't in the txn/mkt convention — better to fail loudly
 * than guess and risk a quality rating event.
 */
export function pickNumber(purpose: Purpose): RoutedNumber {
    if (purpose.startsWith(TXN_PREFIX)) return "1";
    if (purpose.startsWith(MKT_PREFIX)) return "2";
    throw new Error(`[router] unknown purpose: ${purpose}`);
}

/**
 * Defence-in-depth: callers also pass the *intended* number, and we
 * reject the send if it doesn't match the routing rule. This catches
 * a misuse where a journey or campaign accidentally specifies the
 * wrong number id.
 */
export function assertNumberMatchesPurpose(
    purpose: Purpose,
    requestedNumber: RoutedNumber,
): void {
    const expected = pickNumber(purpose);
    if (expected !== requestedNumber) {
        throw new Error(
            `[router] purpose=${purpose} requires number=${expected}, got ${requestedNumber}`,
        );
    }
}

// ─── Audit log ────────────────────────────────────────────────────────────

export interface RoutingAuditEntry {
    orgId: string;
    purpose: Purpose;
    pickedNumber: RoutedNumber;
    integratedNumberId?: string | null;
    campaignMessageId?: string | null;
    rejected?: boolean;
    rejectionReason?: string | null;
}

/**
 * Best-effort audit row. Surfaced at /(dashboard)/whatsapp/settings under
 * the Routing Audit tab. Never throws — auditing a send failure shouldn't
 * also fail the send.
 */
export async function writeAudit(entry: RoutingAuditEntry): Promise<void> {
    try {
        await lmsAdmin.from("lms_routing_audit").insert({
            org_id: entry.orgId,
            purpose: entry.purpose,
            picked_number: entry.pickedNumber,
            integrated_number_id: entry.integratedNumberId ?? null,
            campaign_message_id: entry.campaignMessageId ?? null,
            rejected: entry.rejected ?? false,
            rejection_reason: entry.rejectionReason ?? null,
        });
    } catch (err) {
        console.error(
            "[router] audit insert failed — send proceeded:",
            err instanceof Error ? err.message : err,
        );
    }
}

// ─── Convenience wrapper used by send paths ──────────────────────────────

/**
 * The recommended call shape:
 *
 *   const { number } = await routeSend({ orgId, purpose, integratedNumberId });
 *   // ...perform the actual send to that number...
 *
 * The audit row is written before the send so a downstream send failure
 * still leaves us a record of the routing decision.
 */
export async function routeSend(args: {
    orgId: string;
    purpose: Purpose;
    integratedNumberId?: string;
    campaignMessageId?: string;
}): Promise<{ number: RoutedNumber }> {
    const number = pickNumber(args.purpose);
    await writeAudit({
        orgId: args.orgId,
        purpose: args.purpose,
        pickedNumber: number,
        integratedNumberId: args.integratedNumberId,
        campaignMessageId: args.campaignMessageId,
    });
    return { number };
}
