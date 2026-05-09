import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

/**
 * GET /api/templates
 * Fetch WhatsApp templates from MSG91 using the documented endpoint:
 * control.msg91.com/api/v5/whatsapp/get-template-client/:number
 *
 * MSG91 returns templates with a nested structure:
 *   { name, category, status: "", languages: [{ id, status: "APPROVED", language, code: [{type, text}] }] }
 *
 * We flatten each language variant into the Template shape expected by the frontend:
 *   { id, name, status, language, category, components: [{type, text}] }
 */
export async function GET(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);
    try {
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

        // Get the org's integrated number — prefer msg91 provider numbers for this endpoint
        const { data: numRow } = await supabaseAdmin
            .from("integrated_numbers")
            .select("number, provider")
            .eq("org_id", orgId)
            .eq("active", true)
            .order("created_at", { ascending: true })
            .limit(10);

        // Prefer an MSG91-provider number; fall back to any number
        const msg91Num = (numRow || []).find((n: any) => !n.provider || n.provider === "msg91");
        const anyNum = (numRow || [])[0];
        const integratedNumber = msg91Num?.number || anyNum?.number || "";

        if (!integratedNumber) {
            return NextResponse.json(
                { error: "No integrated WhatsApp number configured. Add one in Settings → WhatsApp Numbers." },
                { status: 400 }
            );
        }

        console.log(`[GET Templates] Fetching for number: ${integratedNumber}, orgId: ${orgId}`);
        const url = `https://control.msg91.com/api/v5/whatsapp/get-template-client/${integratedNumber}`;

        const response = await fetch(url, {
            headers: {
                authkey: authKey,
                accept: "application/json",
            },
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("[GET Templates] MSG91 error:", response.status, JSON.stringify(data));
            console.error(`[GET Templates] Number used: ${integratedNumber}, authKey ending: ...${authKey.slice(-6)}`);
            return NextResponse.json(
                { error: `Failed to fetch templates from MSG91 (${response.status}): ${JSON.stringify(data)}` },
                { status: 502 }
            );
        }

        // If MSG91 returns an array, unwrap it; otherwise check nested shapes
        const rawTemplates = Array.isArray(data) ? data : data.data || data.templates || [];

        if (rawTemplates.length > 0) {
            console.log(`[GET Templates] Raw MSG91 template sample:`, JSON.stringify(rawTemplates[0], null, 2));
        }

        // Flatten MSG91's nested structure into the Template format expected by the frontend
        // MSG91 returns: { name, category, languages: [{ id, status, language, code: [{type, text}] }] }
        // Frontend expects: { id, name, status, language, category, components: [{type, text}] }
        const templates: Record<string, unknown>[] = [];

        for (const raw of rawTemplates) {
            const languages = raw.languages as any[] | undefined;

            if (Array.isArray(languages) && languages.length > 0) {
                // Each language variant becomes a separate template entry
                for (const lang of languages) {
                    const langStatus = (
                        lang.status || lang.approval_status || ""
                    ) as string;

                    // Extract components from the "code" array
                    const components = Array.isArray(lang.code)
                        ? lang.code.map((c: any) => ({
                            type: c.type || "",
                            text: c.text || "",
                            format: c.format || undefined,
                        }))
                        : [];

                    templates.push({
                        id: lang.id || raw.id || raw.template_id || "",
                        name: raw.name || lang.name || "",
                        status: langStatus.toLowerCase() || "approved",
                        language: lang.language || "en",
                        category: ((raw.category as string) || "MARKETING").toUpperCase(),
                        components,
                        // Pass through extra fields that might be useful
                        namespace: raw.namespace || "",
                        variables: lang.variables || [],
                        variableType: lang.variable_type || {},
                        rejectionReason: lang.rejection_reason || "NONE",
                        parameterFormat: lang.parameter_format || "",
                    });
                }
            } else {
                // Fallback: flat structure (older MSG91 response format)
                const rawStatus = (
                    raw.status || raw.approval_status || raw.template_status || ""
                ) as string;

                const components = Array.isArray(raw.components)
                    ? raw.components
                    : Array.isArray(raw.code)
                        ? raw.code.map((c: any) => ({ type: c.type, text: c.text, format: c.format }))
                        : [];

                templates.push({
                    ...raw,
                    id: raw.id || raw.template_id || "",
                    name: raw.name || raw.template_name || "",
                    status: rawStatus.toLowerCase() || "approved",
                    language: raw.language || "en",
                    category: ((raw.category as string) || "MARKETING").toUpperCase(),
                    components,
                });
            }
        }

        console.log(`[GET Templates] Returning ${templates.length} templates (from ${rawTemplates.length} raw entries)`);
        return NextResponse.json(templates);
    } catch (err) {
        console.error("[GET Templates] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch templates" },
            { status: 500 }
        );
    }
}
