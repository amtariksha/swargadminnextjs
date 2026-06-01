/**
 * DSAR service — list, submit, transition state for Data Subject Access Requests.
 *
 * DPDP Rules 2025 require the Data Fiduciary to respond within 7 days of a
 * verified request. We persist sla_deadline at insert (created_at + 7 days)
 * and surface it as a countdown timer in the admin queue.
 *
 * Status machine:
 *   submitted → verifying_identity → in_progress → fulfilled | rejected
 *                                                ↘ expired (7-day SLA passed)
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import type { DsarRequest, DsarRequestType, DsarStatus } from "@/lib/lms/types";

const SLA_DAYS = 7;

export async function submitDsar(args: {
    customerId?: string;
    contactPhone?: string;
    contactEmail?: string;
    requestType: DsarRequestType;
    details?: string;
}): Promise<DsarRequest> {
    if (!args.contactPhone && !args.contactEmail) {
        throw new Error("Either contact_phone or contact_email is required for OTP verification.");
    }

    const slaDeadline = new Date();
    slaDeadline.setDate(slaDeadline.getDate() + SLA_DAYS);

    const { data, error } = await lmsAdmin
        .from("lms_dsar_requests")
        .insert({
            customer_id: args.customerId ?? null,
            contact_phone: args.contactPhone ?? null,
            contact_email: args.contactEmail ?? null,
            request_type: args.requestType,
            status: "submitted" satisfies DsarStatus,
            details: args.details ?? null,
            sla_deadline: slaDeadline.toISOString(),
        })
        .select("*")
        .single();

    if (error) {
        throw new Error(`[dsar] failed to insert request: ${error.message}`);
    }
    return mapRow(data);
}

export async function listDsar(args: {
    status?: DsarStatus | "all";
} = {}): Promise<DsarRequest[]> {
    let q = lmsAdmin
        .from("lms_dsar_requests")
        .select("*")
        .order("sla_deadline", { ascending: true });
    if (args.status && args.status !== "all") {
        q = q.eq("status", args.status);
    }
    const { data, error } = await q;
    if (error) {
        throw new Error(`[dsar] failed to list: ${error.message}`);
    }
    return (data ?? []).map(mapRow);
}

function mapRow(row: Record<string, unknown>): DsarRequest {
    return {
        id: row.id as string,
        orgId: row.org_id as string,
        customerId: (row.customer_id as string | null) ?? null,
        contactPhone: (row.contact_phone as string | null) ?? null,
        contactEmail: (row.contact_email as string | null) ?? null,
        requestType: row.request_type as DsarRequestType,
        status: row.status as DsarStatus,
        details: (row.details as string | null) ?? null,
        slaDeadline: row.sla_deadline as string,
        fulfilledAt: (row.fulfilled_at as string | null) ?? null,
        rejectionReason: (row.rejection_reason as string | null) ?? null,
        handledByUserId: (row.handled_by_user_id as string | null) ?? null,
        createdAt: row.created_at as string,
    };
}
