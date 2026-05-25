/**
 * POST /api/lms/leads/sync-from-contacts
 *
 * Backfill / catch-up sync: scans public.contacts for the org and creates
 * a Lead row for any contact that isn't already represented in lms_leads.
 *
 * Why a sync endpoint rather than a webhook hook?
 *   • Less invasive — the WhatsApp webhook hot path stays untouched.
 *   • Idempotent — re-running is safe; only inserts new rows.
 *   • Restartable — if a run fails partway, the next run picks up where
 *     it left off because we re-check existence per contact.
 *
 * Source attribution:
 *   • If the contact has any conversation with source='ctwa', the lead's
 *     source_details captures the ctwa_clid so attribution survives. The
 *     lead source itself stays 'whatsapp' since the channel is the same.
 *   • Otherwise: source='whatsapp'.
 *
 * Recommended cadence: run nightly via Vercel Cron. Manual trigger lives
 * on /lms/system in the next UI iteration.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/whatsapp/request";
import { lmsAdmin } from "@/lib/lms/supabase";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { createLead } from "@/lib/lms/leads/service";

export const maxDuration = 60;

interface SyncResult {
    contactsScanned: number;
    leadsCreated: number;
    leadsDeduped: number;
    errors: number;
    completedAt: string;
    durationMs: number;
}

export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }

    // ── Pull contacts for this org ────────────────────────────────────
    const { data: contacts, error: cErr } = await supabaseAdmin
        .from("contacts")
        .select("id, name, phone, email, created_at")
        .eq("org_id", orgId);
    if (cErr) {
        return NextResponse.json(
            { error: `contacts fetch failed: ${cErr.message}` },
            { status: 500 },
        );
    }
    const list = contacts ?? [];

    // ── Pull existing lead phones in one go (cheap dedupe pass) ───────
    const { data: existingLeads, error: lErr } = await lmsAdmin
        .from("lms_leads")
        .select("phone")
        .eq("org_id", orgId)
        .not("phone", "is", null);
    if (lErr) {
        return NextResponse.json(
            { error: `leads fetch failed: ${lErr.message}` },
            { status: 500 },
        );
    }
    const seenPhones = new Set(
        (existingLeads ?? []).map((r) => String(r.phone).replace(/^\+/, "").trim()),
    );

    // ── Pull conversation source per contact for CTWA attribution ─────
    const { data: convos, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("contact_id, source, ctwa_clid")
        .eq("org_id", orgId);
    if (convErr) {
        console.warn("[leads/sync] conversation lookup failed (non-fatal):", convErr.message);
    }
    const ctwaByContact = new Map<string, { source: string; ctwa_clid?: string }>();
    for (const c of convos ?? []) {
        const cid = c.contact_id as string;
        const src = (c.source as string) ?? "organic";
        if (src === "ctwa" && !ctwaByContact.has(cid)) {
            ctwaByContact.set(cid, {
                source: src,
                ctwa_clid: (c.ctwa_clid as string) ?? undefined,
            });
        }
    }

    // ── Insert leads ──────────────────────────────────────────────────
    let leadsCreated = 0;
    let leadsDeduped = 0;
    let errors = 0;
    for (const contact of list) {
        const phone = String(contact.phone ?? "").replace(/^\+/, "").trim();
        if (!phone) continue;
        if (seenPhones.has(phone)) {
            leadsDeduped += 1;
            continue;
        }
        const ctwa = ctwaByContact.get(contact.id as string);
        try {
            const result = await createLead({
                orgId,
                source: "whatsapp",
                phone,
                name: (contact.name as string) ?? undefined,
                email: (contact.email as string) ?? undefined,
                sourceDetails: ctwa
                    ? { channel_source: "ctwa", ctwa_clid: ctwa.ctwa_clid }
                    : { channel_source: "organic" },
                metadata: {
                    backfilled_from_contact_id: contact.id,
                    contact_created_at: contact.created_at,
                },
            });
            if (result.deduped) leadsDeduped += 1;
            else leadsCreated += 1;
            seenPhones.add(phone);
        } catch (err) {
            console.error(
                `[leads/sync] failed for contact ${contact.id}:`,
                err instanceof Error ? err.message : err,
            );
            errors += 1;
        }
    }

    const result: SyncResult = {
        contactsScanned: list.length,
        leadsCreated,
        leadsDeduped,
        errors,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
    };
    return NextResponse.json(result);
}
