import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";
import { getPrimaryIntegratedNumber } from "@/lib/whatsapp/numbers";
import { getCTWASettings } from "@/lib/whatsapp/ctwa-settings";

// ─── POST /api/templates/sync ───────────────────────────────
// Sync templates from EVERY live provider — MSG91 numbers via the MSG91
// client-template API, Meta-direct numbers via the Graph message_templates
// edge — then update local template statuses (pending → approved/rejected).
//
// MSG91 returns a nested structure:
//   { name, category, status: "", languages: [{ id, status: "APPROVED", language, code: [...] }] }
// The real status is in languages[0].status, NOT the top-level status.
// Meta returns a flat list: { id, name, status: "APPROVED", category, language }.
//
// A provider that fails becomes a warning, not a hard error — mixed-provider
// tenants still sync whatever is reachable. Hard-fail only when NOTHING synced.
export async function POST(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);

    try {
        // Active numbers, split by provider.
        const { data: activeRows } = await supabaseAdmin
            .from("integrated_numbers")
            .select("number, provider, meta_waba_id, meta_access_token")
            .eq("active", true);
        const rows = activeRows || [];
        const msg91Rows = rows.filter((r) => !r.provider || r.provider === "msg91");
        const metaRows = rows.filter((r) => r.provider === "meta" && r.meta_waba_id && r.meta_access_token);

        if (rows.length === 0) {
            return NextResponse.json(
                { error: "No integrated WhatsApp number configured. Add one in Settings → WhatsApp Numbers." },
                { status: 400 }
            );
        }

        const remoteTemplates: { id: string; name: string; status: string; category: string; language: string }[] = [];
        const warnings: string[] = [];

        // ── MSG91 branch ─────────────────────────────────────
        if (msg91Rows.length > 0) {
            // Resolve auth key: app_settings → organizations table → env var
            let authKey = await getAppSetting("msg91_auth_key", "", orgId);
            if (!authKey) {
                const { data: orgRow } = await supabaseAdmin
                    .from("organizations")
                    .select("msg91_auth_key")
                    .eq("id", orgId)
                    .maybeSingle();
                authKey = orgRow?.msg91_auth_key || process.env.MSG91_AUTH_KEY || "";
            }

            if (!authKey) {
                warnings.push("MSG91 numbers exist but no MSG91 auth key is configured — MSG91 sync skipped.");
            } else {
                // The PRIMARY number (is_primary / WA_PRIMARY_NUMBER / sending
                // number) when it is an MSG91 line, else the first MSG91 line.
                const primary = await getPrimaryIntegratedNumber();
                const integratedNumber = msg91Rows.some((r) => String(r.number) === primary)
                    ? primary
                    : String(msg91Rows[0].number || "");

                console.log(`[Template Sync] Fetching from MSG91 for number: ${integratedNumber}, orgId: ${orgId}`);
                const url = `https://control.msg91.com/api/v5/whatsapp/get-template-client/${integratedNumber}`;
                const response = await fetch(url, {
                    headers: { authkey: authKey, accept: "application/json" },
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.error("[Template Sync] MSG91 error:", response.status, errText);
                    warnings.push(`MSG91 fetch failed (${response.status})`);
                } else {
                    const data = await response.json();
                    const rawTemplates = Array.isArray(data) ? data : data?.data || data?.templates || [];

                    // Flatten MSG91's nested structure: real status is in languages[0].status
                    for (const raw of rawTemplates) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose MSG91 raw shape
                        const languages = raw.languages as any[] | undefined;

                        if (Array.isArray(languages) && languages.length > 0) {
                            for (const lang of languages) {
                                const langStatus = (lang.status || lang.approval_status || "") as string;
                                remoteTemplates.push({
                                    id: lang.id || raw.id || raw.template_id || "",
                                    name: raw.name || lang.name || "",
                                    status: langStatus.toLowerCase(),
                                    category: ((raw.category as string) || "").toUpperCase(),
                                    language: lang.language || "en",
                                });
                            }
                        } else {
                            const rawStatus = (raw.status || raw.approval_status || raw.template_status || "") as string;
                            remoteTemplates.push({
                                id: raw.id || raw.template_id || "",
                                name: raw.name || raw.template_name || "",
                                status: rawStatus.toLowerCase(),
                                category: ((raw.category as string) || "").toUpperCase(),
                                language: raw.language || "en",
                            });
                        }
                    }
                }
            }
        }

        // ── Meta Cloud API branch ────────────────────────────
        if (metaRows.length > 0) {
            const { metaApiVersion } = await getCTWASettings();
            const seenWabas = new Set<string>();
            for (const row of metaRows) {
                const wabaId = String(row.meta_waba_id);
                if (seenWabas.has(wabaId)) continue;
                seenWabas.add(wabaId);
                try {
                    const metaRes = await fetch(
                        `https://graph.facebook.com/${metaApiVersion}/${wabaId}/message_templates?limit=200`,
                        { headers: { Authorization: `Bearer ${row.meta_access_token}` } }
                    );
                    const metaData = await metaRes.json();
                    if (!metaRes.ok || metaData.error) {
                        console.error("[Template Sync] Meta error for WABA", wabaId, metaData?.error || metaRes.status);
                        warnings.push(`Meta fetch failed for WABA ${wabaId}: ${metaData?.error?.message || metaRes.status}`);
                        continue;
                    }
                    for (const t of metaData.data || []) {
                        remoteTemplates.push({
                            id: String(t.id || ""),
                            name: String(t.name || ""),
                            status: String(t.status || "").toLowerCase(),
                            category: String(t.category || "").toUpperCase(),
                            language: String(t.language || "en"),
                        });
                    }
                    console.log(`[Template Sync] Meta WABA ${wabaId}: ${(metaData.data || []).length} templates`);
                } catch (metaErr) {
                    console.error("[Template Sync] Meta fetch threw for WABA", wabaId, metaErr);
                    warnings.push(`Meta fetch error for WABA ${wabaId}`);
                }
            }
        }

        if (remoteTemplates.length === 0 && warnings.length > 0) {
            return NextResponse.json(
                { error: `Template sync failed: ${warnings.join(" | ")}` },
                { status: 502 }
            );
        }

        console.log(`[Template Sync] Fetched ${remoteTemplates.length} remote templates (msg91 numbers: ${msg91Rows.length}, meta WABAs: ${metaRows.length})`);
        for (const rt of remoteTemplates) {
            console.log(`[Template Sync]   Remote: "${rt.name}" status="${rt.status}" category="${rt.category}" id="${rt.id}"`);
        }

        // Update local templates_local statuses AND categories from MSG91 remote
        // Match by msg91_template_id first, then by name (case-insensitive)
        const { data: localTemplates } = await supabaseAdmin
            .from("templates_local")
            .select("id, name, status, category, msg91_template_id");

        console.log(`[Template Sync] Found ${(localTemplates || []).length} local templates`);

        let updated = 0;
        const unmatched: string[] = [];

        for (const local of localTemplates || []) {
            // Match by msg91_template_id first, then by name (case-insensitive)
            const remote = remoteTemplates.find(
                (r: { id: string; name: string; status: string; category: string; language: string }) =>
                    (local.msg91_template_id && r.id && r.id === local.msg91_template_id) ||
                    r.name === local.name ||
                    (r.name && local.name && r.name.toLowerCase() === local.name.toLowerCase())
            );

            if (!remote) {
                unmatched.push(local.name);
                continue;
            }

            // Check if status or category changed
            const remoteCategory = ((remote.category as string) || "").toUpperCase();
            const localCategory = ((local.category as string) || "").toUpperCase();
            const remoteStatus = remote.status?.toLowerCase() || "";
            const localStatus = local.status?.toLowerCase() || "";

            // Only update status if remote has a real value (don't overwrite with empty)
            const statusChanged = remoteStatus && remoteStatus !== localStatus;
            const categoryChanged = remoteCategory && remoteCategory !== localCategory;

            if (statusChanged || categoryChanged) {
                const updateData: Record<string, unknown> = {
                    updated_at: new Date().toISOString(),
                };
                if (remote.id) updateData.msg91_template_id = remote.id;
                if (statusChanged) updateData.status = remoteStatus;
                if (categoryChanged) updateData.category = remoteCategory;

                const { error: updateErr } = await supabaseAdmin
                    .from("templates_local")
                    .update(updateData)
                    .eq("id", local.id);

                if (!updateErr) {
                    updated++;
                    if (statusChanged) console.log(`[Template Sync] ✓ ${local.name}: status "${localStatus}" → "${remoteStatus}"`);
                    if (categoryChanged) console.log(`[Template Sync] ✓ ${local.name}: category "${localCategory}" → "${remoteCategory}"`);
                } else {
                    console.warn("[Template Sync] Update error for", local.name, updateErr.message);
                }
            } else {
                console.log(`[Template Sync] ─ ${local.name}: no changes (remote_status="${remoteStatus}", local_status="${localStatus}", remote_cat="${remoteCategory}", local_cat="${localCategory}")`);
            }
        }

        if (unmatched.length > 0) {
            console.log(`[Template Sync] ✗ ${unmatched.length} local templates had no remote match: ${unmatched.join(", ")}`);
            console.log(`[Template Sync] Remote template names: ${remoteTemplates.map((r) => r.name).join(", ")}`);
        }

        console.log(`[Template Sync] Done. Updated ${updated} of ${(localTemplates || []).length} local templates.`);

        return NextResponse.json({
            synced: true,
            count: remoteTemplates.length,
            updated,
            warnings,
            templates: remoteTemplates,
        });
    } catch (err) {
        console.error("Template sync error:", err);
        return NextResponse.json(
            { error: "Template sync failed" },
            { status: 500 }
        );
    }
}
