/**
 * Campaign service — segment-targeted one-shot / scheduled WhatsApp blasts.
 *
 * A campaign = { name, segment, template, purpose, schedule }. At send time it
 * resolves the segment to recipients (evaluateSegment), runs a single
 * campaign-level Compliance Guard review (the agent goes live here, at the
 * granularity it was designed for), then fans every recipient through the
 * shared dispatch pipeline — so consent, the ≤2/week marketing cap, quiet
 * hours, 2-number routing and the lms_campaign_messages ledger all apply
 * identically to journey sends and campaign sends.
 *
 * v1 is WhatsApp-only: the template + purpose live in lms_campaigns.metadata
 * (content_id / lms_campaign_contents stay reserved for future multi-channel
 * + AI-drafted content). The org_id column is left to its DB default
 * (migration 008) — LMS runs as a single internal org.
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import { getSegment, previewSegment } from "@/lib/lms/segments/service";
import { evaluateSegment } from "@/lib/lms/segments/evaluator";
import { dispatchTemplateSend } from "@/lib/lms/send/dispatch";
import { complianceCheck } from "@/lib/lms/agent-force/agents";
import type { Purpose } from "@/lib/whatsapp/router";
import type { ConsentPurpose } from "@/lib/lms/types";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CampaignStatus =
    | "draft"
    | "pending_approval"
    | "scheduled"
    | "sending"
    | "sent"
    | "cancelled"
    | "failed";

export interface CampaignCounts {
    recipients: number;
    sent: number;
    skipped: number;
    failed: number;
}

export interface Campaign {
    id: string;
    name: string;
    segmentId: string;
    status: CampaignStatus;
    templateName: string;
    templateLanguage: string;
    purpose: Purpose;
    requiresConsent: ConsentPurpose;
    params: Record<string, string> | null;
    scheduledAt: string | null;
    sentAt: string | null;
    counts: CampaignCounts | null;
    createdAt: string;
}

interface CampaignMeta {
    templateName: string;
    templateLanguage: string;
    purpose: Purpose;
    requiresConsent: ConsentPurpose;
    params?: Record<string, string> | null;
    counts?: CampaignCounts;
    compliance?: unknown;
    createdByRaw?: string | null;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createCampaign(args: {
    name: string;
    segmentId: string;
    templateName: string;
    templateLanguage?: string;
    purpose: Purpose;
    requiresConsent?: ConsentPurpose;
    params?: Record<string, string>;
    scheduledAt?: string;
    createdByUserId?: string;
}): Promise<Campaign> {
    const meta: CampaignMeta = {
        templateName: args.templateName,
        templateLanguage: args.templateLanguage ?? "en",
        purpose: args.purpose,
        requiresConsent: args.requiresConsent ?? "marketing_whatsapp",
        params: args.params ?? null,
        createdByRaw: args.createdByUserId ?? null,
    };
    const { data, error } = await lmsAdmin
        .from("lms_campaigns")
        .insert({
            name: args.name,
            segment_id: args.segmentId,
            status: args.scheduledAt ? "scheduled" : "draft",
            channels: ["whatsapp"],
            scheduled_at: args.scheduledAt ?? null,
            created_by_user_id:
                args.createdByUserId && UUID_RE.test(args.createdByUserId)
                    ? args.createdByUserId
                    : SYSTEM_USER_ID,
            metadata: meta,
        })
        .select("*")
        .single();
    if (error) throw new Error(`[campaigns] create failed: ${error.message}`);
    return mapRow(data);
}

export async function listCampaigns(): Promise<Campaign[]> {
    const { data, error } = await lmsAdmin
        .from("lms_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
    if (error) throw new Error(`[campaigns] list failed: ${error.message}`);
    return (data ?? []).map(mapRow);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
    const { data, error } = await lmsAdmin
        .from("lms_campaigns")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`[campaigns] get failed: ${error.message}`);
    return data ? mapRow(data) : null;
}

export async function cancelCampaign(id: string): Promise<void> {
    const { error } = await lmsAdmin
        .from("lms_campaigns")
        .update({ status: "cancelled" })
        .eq("id", id)
        .in("status", ["draft", "scheduled"]);
    if (error) throw new Error(`[campaigns] cancel failed: ${error.message}`);
}

/** Resolve the campaign's segment to a recipient count + sample. */
export async function previewCampaign(
    id: string,
): Promise<{ count: number; samples: { name: string | null; phone: string | null }[]; englishDescription: string }> {
    const campaign = await getCampaign(id);
    if (!campaign) throw new Error("Campaign not found");
    const segment = await getSegment({ segmentId: campaign.segmentId });
    if (!segment) throw new Error("Segment not found");
    const preview = await previewSegment({ filter: segment.filterDsl, sampleLimit: 20 });
    return {
        count: preview.count,
        samples: preview.samples.map((s) => ({ name: s.name, phone: s.phone })),
        englishDescription: preview.englishDescription,
    };
}

// ─── Send ───────────────────────────────────────────────────────────────────

export interface SendSummary {
    status: "sent" | "blocked" | "failed";
    counts: CampaignCounts;
    deferred: number;
    blockedReason?: string;
}

/**
 * Fan a campaign out to its segment. Used by the immediate-send route and the
 * campaigns-tick cron. Idempotency: refuses to re-send a campaign already in a
 * terminal state.
 */
export async function sendCampaign(id: string): Promise<SendSummary> {
    const campaign = await getCampaign(id);
    if (!campaign) throw new Error("Campaign not found");
    if (!["draft", "scheduled"].includes(campaign.status)) {
        throw new Error(`Campaign is ${campaign.status}, not sendable`);
    }

    await setStatus(id, "sending");

    // Campaign-level Compliance Guard (the agent's intended granularity).
    let blockedReason: string | undefined;
    try {
        const verdict = await complianceCheck({
            sessionId: `campaign-${id}`,
            campaignId: id,
        });
        if (verdict && verdict.verdict === "block") {
            blockedReason = verdict.reasons.join("; ") || "compliance_block";
            await finalise(id, "failed", { recipients: 0, sent: 0, skipped: 0, failed: 0 }, verdict);
            return {
                status: "blocked",
                counts: { recipients: 0, sent: 0, skipped: 0, failed: 0 },
                deferred: 0,
                blockedReason,
            };
        }
    } catch (err) {
        // Agent unreachable → proceed; the per-recipient code gates still apply.
        console.warn("[campaigns] compliance check errored, proceeding:", errMsg(err));
    }

    const segment = await getSegment({ segmentId: campaign.segmentId });
    if (!segment) {
        await setStatus(id, "failed");
        throw new Error("Segment not found at send time");
    }
    const evaluation = await evaluateSegment({ filter: segment.filterDsl });

    const counts: CampaignCounts = {
        recipients: evaluation.customerIds.length,
        sent: 0,
        skipped: 0,
        failed: 0,
    };
    let deferred = 0;

    for (const customerId of evaluation.customerIds) {
        const r = await dispatchTemplateSend({
            customerId,
            templateName: campaign.templateName,
            templateLanguage: campaign.templateLanguage,
            purpose: campaign.purpose,
            params: campaign.params ?? undefined,
            requiresConsent: campaign.requiresConsent,
            campaignId: id,
        });
        if (r.status === "sent") counts.sent += 1;
        else if (r.status === "failed") counts.failed += 1;
        else if (r.status === "deferred_quiet_hours") deferred += 1;
        else counts.skipped += 1; // skipped_consent | skipped_cap
    }

    await finalise(id, "sent", counts);
    return { status: "sent", counts, deferred };
}

/** Campaigns whose scheduled time has arrived. */
export async function listDueCampaigns(): Promise<string[]> {
    const { data, error } = await lmsAdmin
        .from("lms_campaigns")
        .select("id")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())
        .limit(50);
    if (error) throw new Error(`[campaigns] listDue failed: ${error.message}`);
    return (data ?? []).map((r) => r.id as string);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function setStatus(id: string, status: CampaignStatus): Promise<void> {
    await lmsAdmin.from("lms_campaigns").update({ status }).eq("id", id);
}

async function finalise(
    id: string,
    status: CampaignStatus,
    counts: CampaignCounts,
    compliance?: unknown,
): Promise<void> {
    // Merge counts (+ optional compliance verdict) into metadata for the list view.
    const { data } = await lmsAdmin
        .from("lms_campaigns")
        .select("metadata")
        .eq("id", id)
        .maybeSingle();
    const meta = ((data?.metadata as CampaignMeta | null) ?? {}) as CampaignMeta;
    const nextMeta: CampaignMeta = { ...meta, counts };
    if (compliance !== undefined) nextMeta.compliance = compliance;
    await lmsAdmin
        .from("lms_campaigns")
        .update({
            status,
            sent_at: status === "sent" ? new Date().toISOString() : null,
            metadata: nextMeta,
        })
        .eq("id", id);
}

function mapRow(row: Record<string, unknown>): Campaign {
    const meta = (row.metadata as CampaignMeta | null) ?? ({} as CampaignMeta);
    return {
        id: row.id as string,
        name: row.name as string,
        segmentId: row.segment_id as string,
        status: row.status as CampaignStatus,
        templateName: meta.templateName ?? "",
        templateLanguage: meta.templateLanguage ?? "en",
        purpose: (meta.purpose ?? "mkt_broadcast") as Purpose,
        requiresConsent: (meta.requiresConsent ?? "marketing_whatsapp") as ConsentPurpose,
        params: meta.params ?? null,
        scheduledAt: (row.scheduled_at as string | null) ?? null,
        sentAt: (row.sent_at as string | null) ?? null,
        counts: meta.counts ?? null,
        createdAt: row.created_at as string,
    };
}

function errMsg(err: unknown): string {
    return err instanceof Error ? err.message : "unknown_error";
}
