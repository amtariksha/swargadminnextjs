import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { invalidateCTWASettingsCache } from "@/lib/whatsapp/ctwa-settings";
import { getRequestContext } from "@/lib/whatsapp/request";

// Settings that are always global (org_id = NULL) and only super_admin can edit
const GLOBAL_ONLY_KEYS = new Set([
    "facebook_app_id",
    "facebook_app_secret",
    "facebook_oauth_redirect_uri",
    "meta_api_version",
    "meta_webhook_verify_token",
]);

// ─── GET /api/settings ─────────────────────────────────────
// Returns merged settings: org-specific values override global defaults.
// Query params: ?orgId=... (optional, super_admin can specify any org)
export async function GET(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const { searchParams } = request.nextUrl;
    const targetOrgId = isSuperAdmin && searchParams.get("orgId")
        ? searchParams.get("orgId")!
        : orgId;

    // Fetch global settings (org_id IS NULL)
    const { data: globalRows } = await supabaseAdmin
        .from("app_settings")
        .select("key, value")
        .is("org_id", null);

    const settings: Record<string, string> = {};
    for (const row of globalRows || []) {
        settings[row.key] = row.value;
    }

    // Fetch org-specific settings (override globals)
    if (targetOrgId) {
        const { data: orgRows } = await supabaseAdmin
            .from("app_settings")
            .select("key, value")
            .eq("org_id", targetOrgId);

        for (const row of orgRows || []) {
            settings[row.key] = row.value;
        }
    }

    return NextResponse.json(settings);
}

// ─── PUT /api/settings ─────────────────────────────────────
// Saves settings. Global-only keys are always saved with org_id = NULL.
// Org-specific keys are saved with the user's org (or specified orgId for super_admin).
export async function PUT(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);
    const body = await request.json();

    if (!body || typeof body !== "object") {
        return NextResponse.json(
            { error: "Request body must be a key-value object" },
            { status: 400 }
        );
    }

    // Extract the target orgId from the body (super_admin can specify)
    const targetOrgId = isSuperAdmin && body._orgId ? body._orgId : orgId;

    const now = new Date().toISOString();
    const entries = Object.entries(body).filter(
        ([k, v]) => typeof v === "string" && k !== "_orgId"
    );

    if (entries.length === 0) {
        return NextResponse.json(
            { error: "No valid settings provided" },
            { status: 400 }
        );
    }

    // Split into global and org-specific entries
    const globalEntries = entries.filter(([key]) => GLOBAL_ONLY_KEYS.has(key));
    const orgEntries = entries.filter(([key]) => !GLOBAL_ONLY_KEYS.has(key));

    // Save global settings (only super_admin can save these)
    if (globalEntries.length > 0 && isSuperAdmin) {
        for (const [key, value] of globalEntries) {
            // Upsert: try to update existing global row, insert if not found
            const { data: existing } = await supabaseAdmin
                .from("app_settings")
                .select("id")
                .eq("key", key)
                .is("org_id", null)
                .maybeSingle();

            if (existing) {
                await supabaseAdmin
                    .from("app_settings")
                    .update({ value: value as string, updated_at: now })
                    .eq("id", existing.id);
            } else {
                await supabaseAdmin
                    .from("app_settings")
                    .insert({ key, value: value as string, org_id: null, updated_at: now });
            }
        }
    }

    // Save org-specific settings
    if (orgEntries.length > 0 && targetOrgId) {
        for (const [key, value] of orgEntries) {
            const { data: existing } = await supabaseAdmin
                .from("app_settings")
                .select("id")
                .eq("key", key)
                .eq("org_id", targetOrgId)
                .maybeSingle();

            if (existing) {
                await supabaseAdmin
                    .from("app_settings")
                    .update({ value: value as string, updated_at: now })
                    .eq("id", existing.id);
            } else {
                await supabaseAdmin
                    .from("app_settings")
                    .insert({ key, value: value as string, org_id: targetOrgId, updated_at: now });
            }
        }
    }

    // Invalidate CTWA settings cache so API routes pick up new values
    invalidateCTWASettingsCache();

    // Return merged settings for the target org
    const { data: allGlobal } = await supabaseAdmin
        .from("app_settings")
        .select("key, value")
        .is("org_id", null);

    const merged: Record<string, string> = {};
    for (const row of allGlobal || []) {
        merged[row.key] = row.value;
    }

    if (targetOrgId) {
        const { data: allOrg } = await supabaseAdmin
            .from("app_settings")
            .select("key, value")
            .eq("org_id", targetOrgId);

        for (const row of allOrg || []) {
            merged[row.key] = row.value;
        }
    }

    return NextResponse.json(merged);
}
