/**
 * Filter DSL — the JSON AST that defines a segment.
 *
 * Spec reference: requirements §2.7.
 *
 * Design goals:
 *   1. Compile-once-render-many — the same AST evaluates to SQL/Supabase
 *      queries AND to an English description AND to a future visual builder.
 *   2. Forwards-compatible — adding a new leaf node type doesn't break the
 *      English renderer (it has a fallthrough).
 *   3. Safe — every leaf type goes through validators before reaching the DB;
 *      the evaluator never accepts raw SQL.
 *
 * Example DSL (from spec §2.7):
 *
 *   {
 *     "op": "AND",
 *     "children": [
 *       { "type": "has_tag", "tag": "ghee" },
 *       { "type": "has_tag", "tag": "diwali-25" },
 *       { "type": "rfm_segment_in", "segments": ["Champions", "Loyal"] },
 *       { "type": "consent", "purpose": "marketing_whatsapp", "granted": true },
 *       { "op": "NOT", "children": [
 *           { "type": "received_campaign_within_days", "days": 7 }
 *       ]}
 *     ]
 *   }
 */

import type { ConsentPurpose } from "@/lib/lms/types";
import type { TagNamespace } from "@/lib/lms/tags/service";

// ─── AST types ────────────────────────────────────────────────────────────

export type FilterNode = CombineNode | LeafNode;

export interface CombineNode {
    op: "AND" | "OR" | "NOT";
    children: FilterNode[];
}

export type LeafNode =
    | HasTagLeaf
    | RfmSegmentInLeaf
    | ConsentLeaf
    | ReceivedCampaignWithinDaysLeaf
    | HealthScoreLeaf;

export interface HasTagLeaf {
    type: "has_tag";
    tag: string;
    namespace?: TagNamespace;
}

export interface RfmSegmentInLeaf {
    type: "rfm_segment_in";
    segments: string[];
}

export interface ConsentLeaf {
    type: "consent";
    purpose: ConsentPurpose;
    granted: boolean;
}

export interface ReceivedCampaignWithinDaysLeaf {
    type: "received_campaign_within_days";
    days: number;
}

export interface HealthScoreLeaf {
    type: "health_score";
    operator: "gte" | "lte" | "eq";
    value: number;
}

// ─── Type guards ──────────────────────────────────────────────────────────

export function isCombineNode(n: FilterNode): n is CombineNode {
    return "op" in n;
}

export function isLeafNode(n: FilterNode): n is LeafNode {
    return "type" in n;
}

// ─── Validation ───────────────────────────────────────────────────────────

/**
 * Walk the AST and throw on the first shape problem.
 * Caller catches the Error and returns 400 to the client.
 */
export function validateFilterDsl(n: unknown, depth = 0): asserts n is FilterNode {
    if (depth > 8) {
        throw new Error("Filter DSL too deeply nested (max depth 8)");
    }
    if (typeof n !== "object" || n === null) {
        throw new Error("Filter DSL must be an object");
    }
    const node = n as Record<string, unknown>;

    if ("op" in node) {
        if (!["AND", "OR", "NOT"].includes(node.op as string)) {
            throw new Error(`Invalid combiner op: ${String(node.op)}`);
        }
        if (!Array.isArray(node.children) || node.children.length === 0) {
            throw new Error(`Combiner "${node.op}" needs at least 1 child`);
        }
        if (node.op === "NOT" && node.children.length !== 1) {
            throw new Error('Combiner "NOT" must have exactly 1 child');
        }
        for (const child of node.children) validateFilterDsl(child, depth + 1);
        return;
    }

    if ("type" in node) {
        const t = node.type as string;
        switch (t) {
            case "has_tag":
                if (typeof node.tag !== "string" || !node.tag) {
                    throw new Error('"has_tag" requires non-empty string "tag"');
                }
                return;
            case "rfm_segment_in":
                if (!Array.isArray(node.segments) || node.segments.length === 0) {
                    throw new Error('"rfm_segment_in" requires non-empty "segments" array');
                }
                return;
            case "consent":
                if (typeof node.purpose !== "string" || typeof node.granted !== "boolean") {
                    throw new Error('"consent" requires "purpose":string + "granted":boolean');
                }
                return;
            case "received_campaign_within_days":
                if (typeof node.days !== "number" || node.days < 0) {
                    throw new Error('"received_campaign_within_days" requires non-negative "days"');
                }
                return;
            case "health_score":
                if (
                    !["gte", "lte", "eq"].includes(node.operator as string) ||
                    typeof node.value !== "number"
                ) {
                    throw new Error('"health_score" requires "operator" + numeric "value"');
                }
                return;
            default:
                throw new Error(`Unknown leaf type: ${t}`);
        }
    }

    throw new Error("Filter DSL node must have either 'op' or 'type'");
}

// ─── English renderer ─────────────────────────────────────────────────────

/**
 * Produce a human description of the filter. Used in the admin UI to
 * surface what a segment definition actually means without forcing the
 * operator to read JSON. Mirrors the SQL compiler's interpretation.
 */
export function renderFilterToEnglish(n: FilterNode): string {
    if (isCombineNode(n)) {
        const parts = n.children.map(renderFilterToEnglish);
        if (n.op === "NOT") return `NOT (${parts[0]})`;
        const joiner = n.op === "AND" ? " AND " : " OR ";
        return parts.length === 1 ? parts[0] : `(${parts.join(joiner)})`;
    }
    if (n.type === "has_tag") {
        const ns = n.namespace ? `${n.namespace}:` : "";
        return `tagged ${ns}${n.tag}`;
    }
    if (n.type === "rfm_segment_in") {
        return `RFM segment in [${n.segments.join(", ")}]`;
    }
    if (n.type === "consent") {
        return `${n.granted ? "consented to" : "withdrawn"} ${n.purpose}`;
    }
    if (n.type === "received_campaign_within_days") {
        return `received a campaign in the last ${n.days} days`;
    }
    if (n.type === "health_score") {
        const opTxt = n.operator === "gte" ? "≥" : n.operator === "lte" ? "≤" : "=";
        return `health score ${opTxt} ${n.value}`;
    }
    return "(unknown filter)";
}
