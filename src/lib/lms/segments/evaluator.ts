/**
 * Filter DSL evaluator.
 *
 * Walks the AST, fetches matching customer IDs for each leaf via Supabase,
 * and combines results with set operations (∩ for AND, ∪ for OR, complement
 * for NOT against the org's full customer pool).
 *
 * Why set-operations in TypeScript instead of one big SQL?
 *   • The DSL is recursive and PostgREST doesn't support arbitrary joins.
 *   • At Swarg's current scale (~800 customers) the per-leaf result sets
 *     are tiny — sub-millisecond set operations.
 *   • Keeps each leaf as a clean parameterised query — no SQL injection
 *     surface area from raw DSL inputs.
 *
 * When customer count grows past ~10k, port the leaf-fetch + intersect
 * pipeline to a single PL/pgSQL function for one-round-trip evaluation.
 *
 * Customer identity convention: a "customer" here is a row in public.contacts
 * (WACRM contacts table). Future unified_customers can map backend MySQL
 * users to contacts but the LMS still uses contacts.id as canonical.
 */

import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { lmsAdmin } from "@/lib/lms/supabase";
import {
    isCombineNode,
    type FilterNode,
    type LeafNode,
} from "@/lib/lms/segments/dsl";

export interface EvaluationResult {
    customerIds: string[];
    count: number;
    sampleSize: number;
}

/**
 * Evaluate the DSL against an org and return the matching contact IDs.
 * Optionally cap to a sample size for preview UI (full recompute uses no cap).
 */
export async function evaluateSegment(args: {
    filter: FilterNode;
    sampleLimit?: number;
}): Promise<EvaluationResult> {
    const allCustomers = await fetchAllCustomers();
    const matched = await evalNode(args.filter, allCustomers);

    let ids = Array.from(matched);
    const count = ids.length;
    if (args.sampleLimit && args.sampleLimit < ids.length) {
        ids = ids.slice(0, args.sampleLimit);
    }
    return { customerIds: ids, count, sampleSize: ids.length };
}

// ─── Recursive walker ─────────────────────────────────────────────────────

async function evalNode(
    n: FilterNode,
    universe: Set<string>,
): Promise<Set<string>> {
    if (isCombineNode(n)) {
        if (n.op === "AND") {
            let acc: Set<string> | null = null;
            for (const child of n.children) {
                const set = await evalNode(child, universe);
                acc = acc ? intersect(acc, set) : set;
                if (acc.size === 0) return acc; // short-circuit
            }
            return acc ?? new Set();
        }
        if (n.op === "OR") {
            const acc = new Set<string>();
            for (const child of n.children) {
                const set = await evalNode(child, universe);
                set.forEach((id) => acc.add(id));
            }
            return acc;
        }
        if (n.op === "NOT") {
            const inner = await evalNode(n.children[0], universe);
            return difference(universe, inner);
        }
    }
    return evalLeaf(n as LeafNode);
}

// ─── Leaf evaluators ──────────────────────────────────────────────────────

async function evalLeaf(n: LeafNode): Promise<Set<string>> {
    switch (n.type) {
        case "has_tag": {
            let q = lmsAdmin
                .from("v_lms_customer_tags_flat")
                .select("customer_id")
                .eq("tag_name", n.tag)
                .eq("effective", true);
            if (n.namespace) q = q.eq("namespace", n.namespace);
            const { data, error } = await q;
            if (error) throw new Error(`[evaluator] has_tag failed: ${error.message}`);
            return new Set((data ?? []).map((r) => r.customer_id as string));
        }

        case "rfm_segment_in": {
            const { data, error } = await lmsAdmin
                .from("lms_rfm_scores")
                .select("customer_id")
                .in("segment", n.segments);
            if (error)
                throw new Error(`[evaluator] rfm_segment_in failed: ${error.message}`);
            return new Set((data ?? []).map((r) => r.customer_id as string));
        }

        case "consent": {
            const { data, error } = await lmsAdmin
                .from("v_lms_customer_consent_effective")
                .select("customer_id")
                .eq("purpose", n.purpose)
                .eq("granted", n.granted);
            if (error)
                throw new Error(`[evaluator] consent failed: ${error.message}`);
            return new Set((data ?? []).map((r) => r.customer_id as string));
        }

        case "received_campaign_within_days": {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - n.days);
            const { data, error } = await lmsAdmin
                .from("lms_campaign_messages")
                .select("customer_id")
                .gte("sent_at", cutoff.toISOString());
            if (error)
                throw new Error(
                    `[evaluator] received_campaign_within_days failed: ${error.message}`,
                );
            return new Set((data ?? []).map((r) => r.customer_id as string));
        }

        case "health_score": {
            const col = "score";
            let q = lmsAdmin
                .from("lms_health_scores")
                .select("customer_id");
            if (n.operator === "gte") q = q.gte(col, n.value);
            else if (n.operator === "lte") q = q.lte(col, n.value);
            else q = q.eq(col, n.value);
            const { data, error } = await q;
            if (error)
                throw new Error(`[evaluator] health_score failed: ${error.message}`);
            return new Set((data ?? []).map((r) => r.customer_id as string));
        }

        default: {
            // Exhaustiveness check: TS catches new leaf types here at compile time.
            const _exhaustive: never = n;
            throw new Error(`Unknown leaf type: ${JSON.stringify(_exhaustive)}`);
        }
    }
}

// ─── Universe + set helpers ───────────────────────────────────────────────

/** All contact IDs. The universe set for NOT operations. */
async function fetchAllCustomers(): Promise<Set<string>> {
    const { data, error } = await supabaseAdmin
        .from("contacts")
        .select("id");
    if (error) throw new Error(`[evaluator] universe fetch failed: ${error.message}`);
    return new Set((data ?? []).map((r) => r.id as string));
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
    const result = new Set<string>();
    // Iterate the smaller set for speed.
    const [small, big] = a.size <= b.size ? [a, b] : [b, a];
    small.forEach((id) => {
        if (big.has(id)) result.add(id);
    });
    return result;
}

function difference(a: Set<string>, b: Set<string>): Set<string> {
    const result = new Set<string>();
    a.forEach((id) => {
        if (!b.has(id)) result.add(id);
    });
    return result;
}
