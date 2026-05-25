/**
 * Segment service — CRUD + preview + recompute.
 *
 * Materialised memberships live in lms_segment_memberships. We don't
 * materialise on every operator action (would thrash on multi-edit
 * sessions); nightly recompute + on-demand button per segment.
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import {
    renderFilterToEnglish,
    type FilterNode,
} from "@/lib/lms/segments/dsl";
import { evaluateSegment } from "@/lib/lms/segments/evaluator";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

export interface Segment {
    id: string;
    orgId: string;
    name: string;
    description?: string | null;
    filterDsl: FilterNode;
    estimatedSize?: number | null;
    lastComputedAt?: string | null;
    isDynamic: boolean;
    createdByUserId?: string | null;
    createdAt: string;
    englishDescription?: string;
}

export interface SegmentPreview {
    count: number;
    samples: SegmentSampleContact[];
    englishDescription: string;
}

export interface SegmentSampleContact {
    contactId: string;
    name: string | null;
    phone: string | null;
}

// ─── Read ─────────────────────────────────────────────────────────────────

export async function listSegments(args: { orgId: string }): Promise<Segment[]> {
    const { data, error } = await lmsAdmin
        .from("lms_segments")
        .select("*")
        .eq("org_id", args.orgId)
        .order("name");
    if (error) throw new Error(`[segments] list failed: ${error.message}`);
    return (data ?? []).map(mapRow);
}

export async function getSegment(args: {
    orgId: string;
    segmentId: string;
}): Promise<Segment | null> {
    const { data, error } = await lmsAdmin
        .from("lms_segments")
        .select("*")
        .eq("org_id", args.orgId)
        .eq("id", args.segmentId)
        .maybeSingle();
    if (error) throw new Error(`[segments] get failed: ${error.message}`);
    return data ? mapRow(data) : null;
}

// ─── Write ────────────────────────────────────────────────────────────────

export async function createSegment(args: {
    orgId: string;
    name: string;
    description?: string;
    filterDsl: FilterNode;
    isDynamic?: boolean;
    createdByUserId?: string;
}): Promise<Segment> {
    const { data, error } = await lmsAdmin
        .from("lms_segments")
        .insert({
            org_id: args.orgId,
            name: args.name,
            description: args.description ?? null,
            filter_dsl: args.filterDsl as unknown,
            is_dynamic: args.isDynamic ?? true,
            created_by_user_id: args.createdByUserId ?? null,
        })
        .select("*")
        .single();
    if (error) throw new Error(`[segments] create failed: ${error.message}`);
    return mapRow(data);
}

export async function updateSegment(args: {
    orgId: string;
    segmentId: string;
    patch: Partial<{
        name: string;
        description: string | null;
        filterDsl: FilterNode;
        isDynamic: boolean;
    }>;
}): Promise<Segment> {
    const update: Record<string, unknown> = {};
    if (args.patch.name !== undefined) update.name = args.patch.name;
    if (args.patch.description !== undefined) update.description = args.patch.description;
    if (args.patch.filterDsl !== undefined) update.filter_dsl = args.patch.filterDsl;
    if (args.patch.isDynamic !== undefined) update.is_dynamic = args.patch.isDynamic;

    const { data, error } = await lmsAdmin
        .from("lms_segments")
        .update(update)
        .eq("org_id", args.orgId)
        .eq("id", args.segmentId)
        .select("*")
        .single();
    if (error) throw new Error(`[segments] update failed: ${error.message}`);
    return mapRow(data);
}

export async function deleteSegment(args: {
    orgId: string;
    segmentId: string;
}): Promise<void> {
    const { error } = await lmsAdmin
        .from("lms_segments")
        .delete()
        .eq("org_id", args.orgId)
        .eq("id", args.segmentId);
    if (error) throw new Error(`[segments] delete failed: ${error.message}`);
}

// ─── Preview + Recompute ──────────────────────────────────────────────────

export async function previewSegment(args: {
    orgId: string;
    filter: FilterNode;
    sampleLimit?: number;
}): Promise<SegmentPreview> {
    const limit = args.sampleLimit ?? 20;
    const evaluation = await evaluateSegment({
        orgId: args.orgId,
        filter: args.filter,
        sampleLimit: limit,
    });

    let samples: SegmentSampleContact[] = [];
    if (evaluation.customerIds.length > 0) {
        const { data, error } = await supabaseAdmin
            .from("contacts")
            .select("id, name, phone")
            .in("id", evaluation.customerIds);
        if (error) {
            console.warn("[segments] sample-contact fetch failed:", error.message);
        } else {
            samples = (data ?? []).map((c) => ({
                contactId: c.id as string,
                name: (c.name as string | null) ?? null,
                phone: (c.phone as string | null) ?? null,
            }));
        }
    }

    return {
        count: evaluation.count,
        samples,
        englishDescription: renderFilterToEnglish(args.filter),
    };
}

/**
 * Recompute materialised memberships:
 *   1. Evaluate filter, get full matching customer set.
 *   2. Replace all rows in lms_segment_memberships for this segment.
 *   3. Update lms_segments.estimated_size + last_computed_at.
 *
 * Replace-strategy is fine at our scale; for larger segments switch to
 * diff-based add/remove to avoid churning the table.
 */
export async function recomputeSegment(args: {
    orgId: string;
    segmentId: string;
}): Promise<{ count: number; computedAt: string }> {
    const segment = await getSegment({
        orgId: args.orgId,
        segmentId: args.segmentId,
    });
    if (!segment) throw new Error(`Segment ${args.segmentId} not found`);

    const evaluation = await evaluateSegment({
        orgId: args.orgId,
        filter: segment.filterDsl,
    });
    const computedAt = new Date().toISOString();

    // Wipe then re-insert. The PK (segment_id, customer_id) prevents dupes.
    const { error: delErr } = await lmsAdmin
        .from("lms_segment_memberships")
        .delete()
        .eq("segment_id", args.segmentId);
    if (delErr) throw new Error(`[segments] recompute delete failed: ${delErr.message}`);

    if (evaluation.customerIds.length > 0) {
        const rows = evaluation.customerIds.map((customer_id) => ({
            segment_id: args.segmentId,
            customer_id,
            computed_at: computedAt,
        }));
        // Insert in batches to stay under PostgREST's default 1000-row payload.
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
            const { error: insErr } = await lmsAdmin
                .from("lms_segment_memberships")
                .insert(rows.slice(i, i + BATCH));
            if (insErr) {
                throw new Error(`[segments] recompute insert failed: ${insErr.message}`);
            }
        }
    }

    await lmsAdmin
        .from("lms_segments")
        .update({
            estimated_size: evaluation.count,
            last_computed_at: computedAt,
        })
        .eq("org_id", args.orgId)
        .eq("id", args.segmentId);

    return { count: evaluation.count, computedAt };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): Segment {
    const dsl = row.filter_dsl as FilterNode;
    return {
        id: row.id as string,
        orgId: row.org_id as string,
        name: row.name as string,
        description: (row.description as string | null) ?? null,
        filterDsl: dsl,
        estimatedSize: (row.estimated_size as number | null) ?? null,
        lastComputedAt: (row.last_computed_at as string | null) ?? null,
        isDynamic: row.is_dynamic as boolean,
        createdByUserId: (row.created_by_user_id as string | null) ?? null,
        createdAt: row.created_at as string,
        englishDescription: dsl ? renderFilterToEnglish(dsl) : undefined,
    };
}
