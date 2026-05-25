/**
 * POST /api/lms/leads/intake/[source]
 *
 * Public lead-intake endpoint. Allowlisted in middleware (no admin JWT
 * required). Called by:
 *   • desicowmilkweb / swargfoodotcom website contact forms
 *   • swargcustomerapp Flutter signup forms
 *   • stall PWA at kiosk events
 *
 * Auth: per-source HMAC signature in `x-intake-signature` header. The
 * signature is `hex(hmac_sha256(secret, rawBody))`. Secrets are configured
 * server-side via env: LMS_INTAKE_SECRET_<SOURCE_UPPER>. If the secret env
 * is unset for a given source, the endpoint rejects all requests for it
 * (defaults-deny).
 *
 * Allowed [source] values are constrained to public-suitable origins —
 * NOT 'manual' / 'csv_import' (those go through the admin-gated route).
 *
 * Consent: DPDP requires marketing consent at collection. The body
 * MUST include marketingConsentGranted:true to enable downstream
 * marketing — otherwise the lead is created with transactional-only
 * status and the consent ledger receives a row reflecting that.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createLead } from "@/lib/lms/leads/service";
import { recordConsent } from "@/lib/lms/consent/service";
import { getLatestNotice } from "@/lib/lms/consent/notice";
import type { LeadSource } from "@/lib/lms/leads/types";

const PUBLIC_SOURCES: LeadSource[] = [
    "website_form",
    "app_install",
    "stall",
    "referral",
    "social",
    "geo_ai",
    "organic_search",
];

const bodySchema = z.object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().min(6).max(20),       // phone required for public intake
    email: z.string().email().optional(),
    pincode: z.string().max(12).optional(),
    language: z.string().max(8).optional(),
    interests: z.array(z.string().max(64)).max(20).optional(),
    notes: z.string().max(2000).optional(),
    marketingConsentGranted: z.boolean().default(false),
    consentChannels: z.array(z.enum(["whatsapp", "email", "sms", "in_app"])).optional(),
    /** Form-side metadata: utm_*, referrer, page_url, etc. */
    metadata: z.record(z.string(), z.unknown()).optional(),
});

async function hmacVerify(secret: string, body: string, sig: string): Promise<boolean> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const buf = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    const computed = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    // Constant-time-ish compare. JS doesn't expose a true constant-time
    // primitive in Edge runtime; equal-length compare prevents trivial
    // timing-side-channel sniffing.
    if (computed.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
        diff |= computed.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    return diff === 0;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ source: string }> },
) {
    const { source: sourceParam } = await params;
    const source = sourceParam as LeadSource;
    if (!PUBLIC_SOURCES.includes(source)) {
        return NextResponse.json(
            { error: `Source "${sourceParam}" not allowed for public intake.` },
            { status: 400 },
        );
    }

    // ── HMAC verification ──────────────────────────────────────────────
    const secretKey = `LMS_INTAKE_SECRET_${source.toUpperCase()}`;
    const secret = process.env[secretKey];
    if (!secret) {
        // Defaults-deny: secret must be explicitly configured before this
        // source accepts traffic. Prevents accidental open-intake on prod.
        console.warn(`[lms/intake] ${secretKey} not set — rejecting all ${source} requests`);
        return NextResponse.json({ error: "Source not configured" }, { status: 503 });
    }
    const sig = request.headers.get("x-intake-signature");
    if (!sig) {
        return NextResponse.json(
            { error: "Missing x-intake-signature header" },
            { status: 401 },
        );
    }
    const rawBody = await request.text();
    const sigOk = await hmacVerify(secret, rawBody, sig);
    if (!sigOk) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // ── Body validation ────────────────────────────────────────────────
    let json: unknown;
    try {
        json = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    // ── Resolve tenant ─────────────────────────────────────────────────
    // Phase B will replace this with per-domain → tenant_code → org_id
    // resolution. Day 1 is single-tenant.
    const orgId = process.env.WACRM_ORG_ID;
    if (!orgId) {
        return NextResponse.json(
            { error: "Service misconfigured — WACRM_ORG_ID not set" },
            { status: 503 },
        );
    }

    // ── Persist ───────────────────────────────────────────────────────
    try {
        const result = await createLead({
            orgId,
            source,
            sourceDetails: {
                ...(parsed.data.metadata ?? {}),
                ip_hash: undefined, // intentionally not recorded — see consent service for hashed IP capture
            },
            name: parsed.data.name,
            phone: parsed.data.phone,
            email: parsed.data.email,
            pincode: parsed.data.pincode,
            language: parsed.data.language,
            tags: parsed.data.interests,
            notes: parsed.data.notes,
            metadata: parsed.data.metadata,
        });

        // ── Record consent ────────────────────────────────────────────
        // We can't tie consent to a customer_id at this point (the lead
        // is in lms_leads, contacts row may not exist yet). We write
        // consent rows keyed by the lead's UUID so the audit ledger has
        // SOMETHING; the rows get re-tagged with the real contacts.id
        // when the lead converts. Better than dropping the consent
        // record on the floor.
        const noticeVersion = getLatestNotice("en").version;
        const language = parsed.data.language ?? "en";
        const channels = parsed.data.consentChannels ?? [
            "whatsapp",
            "email",
            "sms",
            "in_app",
        ];
        const purposeMap: Record<string, string> = {
            whatsapp: "marketing_whatsapp",
            email: "marketing_email",
            sms: "marketing_sms",
            in_app: "marketing_in_app",
        };
        for (const ch of channels) {
            const purpose = purposeMap[ch];
            if (!purpose) continue;
            try {
                await recordConsent({
                    orgId,
                    customerId: result.lead.id, // stand-in until conversion re-tags
                    purpose: purpose as Parameters<typeof recordConsent>[0]["purpose"],
                    granted: parsed.data.marketingConsentGranted,
                    source:
                        source === "stall"
                            ? "stall"
                            : source === "app_install"
                              ? "in_app_toggle"
                              : "signup",
                    noticeVersion,
                    language,
                });
            } catch (consentErr) {
                console.warn(
                    "[lms/intake] consent record failed (non-fatal):",
                    consentErr,
                );
            }
        }

        return NextResponse.json(
            {
                leadId: result.lead.id,
                deduped: result.deduped,
                status: result.lead.status,
            },
            { status: result.deduped ? 200 : 201 },
        );
    } catch (err) {
        console.error("[POST /api/lms/leads/intake/:source]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
