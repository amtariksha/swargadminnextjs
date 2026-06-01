import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

// ─── POST /api/templates/sync ───────────────────────────────
// Sync templates with MSG91 / Meta — fetches remote templates and
// updates local template statuses (pending → approved/rejected).
//
// MSG91 returns a nested structure:
//   { name, category, status: "", languages: [{ id, status: "APPROVED", language, code: [...] }] }
// The real status is in languages[0].status, NOT the top-level status.
export async function POST(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);

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
        return NextResponse.json(
            { error: "MSG91 Auth Key not configured. Set it in Settings or as MSG91_AUTH_KEY env variable." },
            { status: 500 }
        );
    }

    try {
        // Get the integrated number — prefer msg91 provider for this endpoint
        const { data: numRows } = await supabaseAdmin
            .from("integrated_numbers")
            .select("number, provider")
            .eq("active", true)
            .order("created_at", { ascending: true })
            .limit(10);

        const msg91Num = (numRows || []).find((n: any) => !n.provider || n.provider === "msg91");
        const anyNum = (numRows || [])[0];
        const integratedNumber = msg91Num?.number || anyNum?.number || "";

        if (!integratedNumber) {
            return NextResponse.json(
                { error: "No integrated WhatsApp number configured. Add one in Settings → WhatsApp Numbers." },
                { status: 400 }
            );
        }

        console.log(`[Template Sync] Fetching from MSG91 for number: ${integratedNumber}, orgId: ${orgId}`);

        // Fetch templates from MSG91
        const url = `https://control.msg91.com/api/v5/whatsapp/get-template-client/${integratedNumber}`;
        const response = await fetch(url, {
            headers: {
                authkey: authKey,
                accept: "application/json",
            },
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("[Template Sync] MSG91 error:", response.status, errText);
            return NextResponse.json(
                { error: `Failed to fetch templates from MSG91 (${response.status}): ${errText}` },
                { status: 502 }
            );
        }

        const data = await response.json();
        const rawTemplates = Array.isArray(data) ? data : data?.data || data?.templates || [];

        if (rawTemplates.length > 0) {
            console.log(`[Template Sync] Raw MSG91 template sample (first):`, JSON.stringify(rawTemplates[0], null, 2));
        }

        // Flatten MSG91's nested structure: real status is in languages[0].status
        const remoteTemplates: { id: string; name: string; status: string; category: string; language: string }[] = [];

        for (const raw of rawTemplates) {
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
                // Fallback: flat structure
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

        console.log(`[Template Sync] Fetched ${remoteTemplates.length} remote templates from MSG91`);
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
