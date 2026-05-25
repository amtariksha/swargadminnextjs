/**
 * Tag service — namespaced labels assigned to customers.
 *
 * Schema reference: app_lms.lms_tags + app_lms.lms_customer_tags.
 * Spec reference: requirements §2.2.
 *
 * Five namespaces (CHECK-constrained):
 *   channel    — how we reached them (e.g. 'app_user', 'web_only', 'whatsapp_only')
 *   product    — what they buy (e.g. 'ghee', 'paneer', 'curd')
 *   festival   — seasonal interest (e.g. 'diwali-25', 'janmashtami-26')
 *   context    — situational (e.g. 'vip_visitor', 'inner_circle')
 *   behaviour  — engagement (e.g. 'high_engagement', 'churn_risk')
 *   custom     — escape hatch for one-offs
 *
 * Auto-tag rules (auto_rule_json) describe how a tag is assigned at scale —
 * e.g. {"if":{"ordered_sku":"GHEE-500ML"},"then":"tag:ghee"}. Auto-tagging
 * runs nightly + on order events (executor implemented in C3+).
 */

import { lmsAdmin } from "@/lib/lms/supabase";

export type TagNamespace =
    | "channel"
    | "product"
    | "festival"
    | "context"
    | "behaviour"
    | "custom";

export type TagAssignmentSource = "auto" | "manual" | "imported";

export interface Tag {
    id: string;
    orgId: string;
    name: string;
    namespace: TagNamespace;
    color?: string | null;
    autoRule?: Record<string, unknown> | null;
    createdAt: string;
    usageCount?: number;
}

export interface TagAssignment {
    customerId: string;
    tagId: string;
    source: TagAssignmentSource;
    assignedAt: string;
    expiresAt?: string | null;
}

// ─── Read ─────────────────────────────────────────────────────────────────

export async function listTags(args: {
    orgId: string;
    namespace?: TagNamespace;
}): Promise<Tag[]> {
    let q = lmsAdmin
        .from("lms_tags")
        .select("*")
        .eq("org_id", args.orgId)
        .order("namespace")
        .order("name");
    if (args.namespace) q = q.eq("namespace", args.namespace);
    const { data, error } = await q;
    if (error) throw new Error(`[tags] list failed: ${error.message}`);
    return (data ?? []).map(mapTagRow);
}

/** Tag list with active-assignment counts. Useful for the operator-facing
 *  Tag list page so they can see which tags are widely used vs. orphan. */
export async function listTagsWithCounts(args: {
    orgId: string;
}): Promise<Tag[]> {
    const tags = await listTags({ orgId: args.orgId });
    if (tags.length === 0) return tags;

    // Count active assignments per tag using the denormalised view.
    const { data, error } = await lmsAdmin
        .from("v_lms_customer_tags_flat")
        .select("tag_id, customer_id")
        .eq("org_id", args.orgId)
        .eq("effective", true);
    if (error) {
        // Counts are nice-to-have — return tags without them if the view query fails.
        console.warn("[tags] usage count query failed:", error.message);
        return tags;
    }
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
        const id = row.tag_id as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return tags.map((t) => ({ ...t, usageCount: counts.get(t.id) ?? 0 }));
}

export async function getCustomerTags(args: {
    orgId: string;
    customerId: string;
}): Promise<Tag[]> {
    const { data, error } = await lmsAdmin
        .from("v_lms_customer_tags_flat")
        .select(
            "tag_id, tag_name, namespace, source, assigned_at, expires_at, effective, org_id",
        )
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .eq("effective", true)
        .order("namespace");
    if (error) throw new Error(`[tags] customer tags failed: ${error.message}`);
    return (data ?? []).map((row) => ({
        id: row.tag_id as string,
        orgId: row.org_id as string,
        name: row.tag_name as string,
        namespace: row.namespace as TagNamespace,
        createdAt: row.assigned_at as string,
    }));
}

// ─── Write ────────────────────────────────────────────────────────────────

export async function createTag(args: {
    orgId: string;
    name: string;
    namespace: TagNamespace;
    color?: string;
    autoRule?: Record<string, unknown>;
}): Promise<Tag> {
    const { data, error } = await lmsAdmin
        .from("lms_tags")
        .insert({
            org_id: args.orgId,
            name: args.name,
            namespace: args.namespace,
            color: args.color ?? null,
            auto_rule_json: args.autoRule ?? null,
        })
        .select("*")
        .single();
    if (error) throw new Error(`[tags] create failed: ${error.message}`);
    return mapTagRow(data);
}

export async function deleteTag(args: {
    orgId: string;
    tagId: string;
}): Promise<void> {
    // ON DELETE CASCADE on lms_customer_tags.tag_id handles unassignment.
    const { error } = await lmsAdmin
        .from("lms_tags")
        .delete()
        .eq("org_id", args.orgId)
        .eq("id", args.tagId);
    if (error) throw new Error(`[tags] delete failed: ${error.message}`);
}

export async function assignTag(args: {
    customerId: string;
    tagId: string;
    source?: TagAssignmentSource;
    expiresAt?: string | null;
}): Promise<TagAssignment> {
    const row = {
        customer_id: args.customerId,
        tag_id: args.tagId,
        source: args.source ?? "manual",
        expires_at: args.expiresAt ?? null,
    };
    // Upsert so re-assigning is idempotent and refreshes expires_at / source.
    const { data, error } = await lmsAdmin
        .from("lms_customer_tags")
        .upsert(row, { onConflict: "customer_id,tag_id" })
        .select("*")
        .single();
    if (error) throw new Error(`[tags] assign failed: ${error.message}`);
    return {
        customerId: data.customer_id as string,
        tagId: data.tag_id as string,
        source: data.source as TagAssignmentSource,
        assignedAt: data.assigned_at as string,
        expiresAt: (data.expires_at as string | null) ?? null,
    };
}

export async function unassignTag(args: {
    customerId: string;
    tagId: string;
}): Promise<void> {
    const { error } = await lmsAdmin
        .from("lms_customer_tags")
        .delete()
        .eq("customer_id", args.customerId)
        .eq("tag_id", args.tagId);
    if (error) throw new Error(`[tags] unassign failed: ${error.message}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function mapTagRow(row: Record<string, unknown>): Tag {
    return {
        id: row.id as string,
        orgId: row.org_id as string,
        name: row.name as string,
        namespace: row.namespace as TagNamespace,
        color: (row.color as string | null) ?? null,
        autoRule:
            (row.auto_rule_json as Record<string, unknown> | null) ?? null,
        createdAt: row.created_at as string,
    };
}
