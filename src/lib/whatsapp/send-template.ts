/**
 * Server-side WhatsApp TEMPLATE sender for internal ops alerts (NOT customer
 * conversation messages — it deliberately does NOT persist a `messages` row).
 *
 * Reuses the provider resolution + template payloads from chat/send, condensed
 * to the template case. Proactive sends outside the 24h session window require
 * an approved template (free text won't deliver), so callers pass a template
 * name + body params.
 */

import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getAppSetting } from "@/lib/whatsapp/settings";
import { getPrimaryIntegratedNumber } from "@/lib/whatsapp/numbers";

type NumberRow = Record<string, unknown> & {
    number?: string | null;
    provider?: string | null;
    meta_phone_number_id?: string | null;
    meta_access_token?: string | null;
};

async function resolveSendingNumber(): Promise<NumberRow | null> {
    const primary = await getPrimaryIntegratedNumber();
    if (primary) {
        const { data } = await supabaseAdmin
            .from("integrated_numbers").select("*").eq("number", primary).maybeSingle();
        if (data) return data as NumberRow;
    }
    const { data } = await supabaseAdmin
        .from("integrated_numbers").select("*").eq("active", true)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
    return (data as NumberRow) ?? null;
}

/**
 * Send an approved WhatsApp template to a phone. Returns {ok} — never throws.
 * bodyParams fill the template's {{1}}, {{2}}, … in order.
 */
export async function sendWhatsAppTemplate(args: {
    to: string;
    templateName: string;
    language?: string;
    bodyParams?: string[];
    orgId?: string;
}): Promise<{ ok: boolean; error?: string }> {
    const phone = String(args.to).replace(/[^0-9]/g, "");
    if (phone.length < 6) return { ok: false, error: "invalid recipient phone" };

    const numConfig = await resolveSendingNumber();
    if (!numConfig?.number) return { ok: false, error: "no integrated number configured" };

    const provider = numConfig.provider || "msg91";
    const language = args.language || "en";
    const bodyParams = args.bodyParams ?? [];
    // components keyed "1".."N" → matches the shape chat/send passes through.
    const components: Record<string, { type: string; value: string }> = {};
    bodyParams.forEach((v, i) => { components[String(i + 1)] = { type: "text", value: String(v ?? "") }; });

    if (provider === "meta") {
        const pid = numConfig.meta_phone_number_id;
        const token = numConfig.meta_access_token;
        if (!pid || !token) return { ok: false, error: "meta credentials missing on sending number" };
        const parameters = bodyParams.map((v) => ({ type: "text", text: String(v ?? "") }));
        const payload = {
            messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "template",
            template: {
                name: args.templateName, language: { code: language },
                components: parameters.length ? [{ type: "body", parameters }] : [],
            },
        };
        try {
            const res = await fetch(`https://graph.facebook.com/v19.0/${pid}/messages`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) return { ok: false, error: `meta ${res.status}: ${(await res.text()).slice(0, 300)}` };
            return { ok: true };
        } catch (e) {
            return { ok: false, error: `meta network: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    // MSG91
    let authKey = await getAppSetting("msg91_auth_key", "", args.orgId ?? "");
    if (!authKey) {
        const { data: orgRow } = await supabaseAdmin
            .from("organizations").select("msg91_auth_key").eq("id", args.orgId ?? "").maybeSingle();
        authKey = orgRow?.msg91_auth_key || process.env.MSG91_AUTH_KEY || "";
    }
    if (!authKey) return { ok: false, error: "msg91 auth key not configured" };
    const payload = {
        integrated_number: numConfig.number, content_type: "template",
        payload: {
            messaging_product: "whatsapp", type: "template",
            template: {
                name: args.templateName, language: { code: language },
                to_and_components: [{ to: [phone], components }],
            },
        },
    };
    try {
        const res = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
            method: "POST",
            headers: { authkey: authKey, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const txt = await res.text();
        if (!res.ok) return { ok: false, error: `msg91 ${res.status}: ${txt.slice(0, 300)}` };
        try { const j = JSON.parse(txt); if (j?.hasError) return { ok: false, error: `msg91: ${JSON.stringify(j.errors).slice(0, 300)}` }; } catch { /* non-JSON ok */ }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: `msg91 network: ${e instanceof Error ? e.message : String(e)}` };
    }
}

/**
 * Fire a "new lead assigned" WhatsApp template to the sales person.
 *
 * OPT-IN: does nothing unless app_setting "Lead Assignment Alert Enabled" is
 * truthy — so nothing fails until the operator has created + Meta-approved the
 * template and flipped it on. Template name/language are configurable via
 * app_settings (default "new_lead_assignment" / "en"); the template needs two
 * body vars: {{1}} = lead name, {{2}} = lead phone. Never throws.
 */
export async function notifyLeadAssignment(args: {
    ownerPhone?: string | null;
    ownerName?: string | null;
    leadName?: string | null;
    leadPhone?: string | null;
    orgId?: string;
}): Promise<void> {
    try {
        if (!args.ownerPhone) return;
        const enabled = (await getAppSetting("Lead Assignment Alert Enabled", "", args.orgId ?? "")).toString().toLowerCase();
        if (enabled !== "1" && enabled !== "true" && enabled !== "yes" && enabled !== "on") return; // default OFF
        const templateName = (await getAppSetting("lead_assignment_template_name", "", args.orgId ?? "")) || "new_lead_assignment";
        const language = (await getAppSetting("lead_assignment_template_language", "", args.orgId ?? "")) || "en";
        const res = await sendWhatsAppTemplate({
            to: args.ownerPhone,
            templateName,
            language,
            bodyParams: [args.leadName || "New lead", args.leadPhone || "—"],
            orgId: args.orgId,
        });
        if (!res.ok) console.warn("[lead-alert] template send failed:", res.error);
    } catch (e) {
        console.warn("[lead-alert] error:", e instanceof Error ? e.message : String(e));
    }
}
