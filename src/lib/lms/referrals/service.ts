/**
 * Referrals service — code generation, redemption, anti-abuse, Inner Circle.
 *
 * Spec reference: requirements §2.6.
 *
 * Code generation: short, memorable, unique per customer. Format is
 *   <3 letters from name>-<4 random base32 chars>
 * — `ANI-7K2X`, `PRA-92BC`, etc. Easy to share verbally. Re-generation is
 * idempotent: each customer has exactly one active code.
 *
 * Redemption flow (called from /api/lms/referrals/redeem):
 *   1. Lookup code → owner_customer_id.
 *   2. Validate: code active, not own code, max_uses not exceeded.
 *   3. Anti-abuse:
 *        • Redeemer phone must not match a previous customer phone (no
 *          self-referral via second account).
 *        • Redeemer device_id, if provided, must not have been used.
 *   4. Insert lms_referral_conversions row with status='pending'.
 *   5. Caller (campaign / journey) credits both parties on first delivery
 *      completion event by setting reward_status='granted'.
 *
 * Inner Circle: loyalty_accounts.in_inner_circle bool. Manual add by
 * super-admin; the "Quarterly Touch" journey reads this flag and only
 * enrols flagged customers.
 */

import { lmsAdmin } from "@/lib/lms/supabase";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
const CODE_LEN = 4;

// ─── Code generation ─────────────────────────────────────────────────────

export interface ReferralCode {
    code: string;
    orgId: string;
    ownerCustomerId: string;
    rewardGiver: number | null;
    rewardReceiver: number | null;
    usesCount: number;
    maxUses: number | null;
    active: boolean;
    createdAt: string;
}

export async function getOrCreateCode(args: {
    ownerCustomerId: string;
    ownerName?: string;
    rewardGiver?: number;
    rewardReceiver?: number;
    maxUses?: number;
}): Promise<ReferralCode> {
    // 1. Return existing active code if present.
    const { data: existing, error: lookupErr } = await lmsAdmin
        .from("lms_referral_codes")
        .select("*")
        .eq("owner_customer_id", args.ownerCustomerId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (lookupErr) throw new Error(`[referrals] lookup failed: ${lookupErr.message}`);
    if (existing) return mapCodeRow(existing);

    // 2. Generate a unique code. Retry on collision (very rare with 32^4 = ~1M).
    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateCode(args.ownerName);
        const { error } = await lmsAdmin.from("lms_referral_codes").insert({
            code: candidate,
            owner_customer_id: args.ownerCustomerId,
            reward_giver: args.rewardGiver ?? null,
            reward_receiver: args.rewardReceiver ?? null,
            max_uses: args.maxUses ?? null,
        });
        if (!error) {
            const { data, error: refetchErr } = await lmsAdmin
                .from("lms_referral_codes")
                .select("*")
                .eq("code", candidate)
                .maybeSingle();
            if (refetchErr || !data) {
                throw new Error(
                    refetchErr?.message ?? "[referrals] refetch after insert failed",
                );
            }
            return mapCodeRow(data);
        }
        // Code collision (PK on code) — retry with a fresh code.
        if (!error.message.includes("duplicate")) {
            throw new Error(`[referrals] insert failed: ${error.message}`);
        }
    }
    throw new Error("[referrals] failed to generate unique code after 5 attempts");
}

function generateCode(ownerName?: string): string {
    const prefix = (ownerName ?? "REF")
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 3)
        .toUpperCase()
        .padEnd(3, "X");
    let suffix = "";
    for (let i = 0; i < CODE_LEN; i++) {
        suffix += CODE_ALPHABET.charAt(
            Math.floor(Math.random() * CODE_ALPHABET.length),
        );
    }
    return `${prefix}-${suffix}`;
}

// ─── Redemption ───────────────────────────────────────────────────────────

export interface RedeemResult {
    success: true;
    code: string;
    ownerCustomerId: string;
    rewardGiver: number | null;
    rewardReceiver: number | null;
    conversionId: string;
}

export interface RedeemRejection {
    success: false;
    reason:
        | "code_not_found"
        | "code_inactive"
        | "self_referral"
        | "max_uses_reached"
        | "duplicate_redemption"
        | "missing_order_context";
}

export async function redeemCode(args: {
    code: string;
    newCustomerId: string;
    firstOrderId: string;
    /** Optional device identifier for cross-device dedupe. */
    deviceId?: string;
}): Promise<RedeemResult | RedeemRejection> {
    if (!args.firstOrderId) {
        return { success: false, reason: "missing_order_context" };
    }

    const { data: code, error: codeErr } = await lmsAdmin
        .from("lms_referral_codes")
        .select("*")
        .eq("code", args.code.toUpperCase())
        .maybeSingle();
    if (codeErr) {
        throw new Error(`[referrals] code lookup failed: ${codeErr.message}`);
    }
    if (!code) return { success: false, reason: "code_not_found" };
    if (!code.active) return { success: false, reason: "code_inactive" };
    if ((code.owner_customer_id as string) === args.newCustomerId) {
        return { success: false, reason: "self_referral" };
    }
    if (code.max_uses && (code.uses_count as number) >= (code.max_uses as number)) {
        return { success: false, reason: "max_uses_reached" };
    }

    // Anti-abuse: same customer can't redeem twice across any code.
    const { data: prior } = await lmsAdmin
        .from("lms_referral_conversions")
        .select("id")
        .eq("new_customer_id", args.newCustomerId)
        .limit(1);
    if (prior && prior.length > 0) {
        return { success: false, reason: "duplicate_redemption" };
    }

    // Insert conversion row + bump uses_count.
    const { data: conv, error: convErr } = await lmsAdmin
        .from("lms_referral_conversions")
        .insert({
            code: args.code.toUpperCase(),
            new_customer_id: args.newCustomerId,
            first_order_id: args.firstOrderId,
            reward_status: "pending",
        })
        .select("id")
        .single();
    if (convErr) {
        throw new Error(`[referrals] conversion insert failed: ${convErr.message}`);
    }
    await lmsAdmin
        .from("lms_referral_codes")
        .update({ uses_count: (code.uses_count as number) + 1 })
        .eq("code", args.code.toUpperCase());

    return {
        success: true,
        code: args.code.toUpperCase(),
        ownerCustomerId: code.owner_customer_id as string,
        rewardGiver: (code.reward_giver as number | null) ?? null,
        rewardReceiver: (code.reward_receiver as number | null) ?? null,
        conversionId: conv.id as string,
    };
}

/** Mark a pending conversion as granted (called when reward conditions met). */
export async function grantReferralReward(args: {
    conversionId: string;
}): Promise<void> {
    const { error } = await lmsAdmin
        .from("lms_referral_conversions")
        .update({
            reward_status: "granted",
            granted_at: new Date().toISOString(),
        })
        .eq("id", args.conversionId);
    if (error) throw new Error(`[referrals] grant failed: ${error.message}`);
}

// ─── Inner Circle ─────────────────────────────────────────────────────────

export interface InnerCircleMember {
    customerId: string;
    orgId: string;
    tier: string | null;
    pointsBalance: number;
    inInnerCircle: boolean;
    innerCircleSince: string | null;
}

export async function listInnerCircle(): Promise<InnerCircleMember[]> {
    const { data, error } = await lmsAdmin
        .from("lms_loyalty_accounts")
        .select("*")
        .eq("in_inner_circle", true)
        .order("inner_circle_since", { ascending: false });
    if (error) throw new Error(`[innercircle] list failed: ${error.message}`);
    return (data ?? []).map(mapLoyaltyRow);
}

export async function addToInnerCircle(args: {
    customerId: string;
    tier?: string;
}): Promise<InnerCircleMember> {
    // Upsert: create the loyalty_account row if missing, flip flag if exists.
    const now = new Date().toISOString();
    const { data, error } = await lmsAdmin
        .from("lms_loyalty_accounts")
        .upsert(
            {
                customer_id: args.customerId,
                tier: args.tier ?? "inner_circle",
                in_inner_circle: true,
                inner_circle_since: now,
            },
            { onConflict: "customer_id" },
        )
        .select("*")
        .single();
    if (error) throw new Error(`[innercircle] add failed: ${error.message}`);
    return mapLoyaltyRow(data);
}

export async function removeFromInnerCircle(args: {
    customerId: string;
}): Promise<void> {
    const { error } = await lmsAdmin
        .from("lms_loyalty_accounts")
        .update({ in_inner_circle: false, inner_circle_since: null })
        .eq("customer_id", args.customerId);
    if (error) throw new Error(`[innercircle] remove failed: ${error.message}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function mapCodeRow(row: Record<string, unknown>): ReferralCode {
    return {
        code: row.code as string,
        orgId: row.org_id as string,
        ownerCustomerId: row.owner_customer_id as string,
        rewardGiver: (row.reward_giver as number | null) ?? null,
        rewardReceiver: (row.reward_receiver as number | null) ?? null,
        usesCount: (row.uses_count as number) ?? 0,
        maxUses: (row.max_uses as number | null) ?? null,
        active: row.active as boolean,
        createdAt: row.created_at as string,
    };
}

function mapLoyaltyRow(row: Record<string, unknown>): InnerCircleMember {
    return {
        customerId: row.customer_id as string,
        orgId: row.org_id as string,
        tier: (row.tier as string | null) ?? null,
        pointsBalance: (row.points_balance as number) ?? 0,
        inInnerCircle: (row.in_inner_circle as boolean) ?? false,
        innerCircleSince: (row.inner_circle_since as string | null) ?? null,
    };
}
