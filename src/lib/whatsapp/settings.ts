import { supabaseAdmin } from "./supabase";

/**
 * Fetches all app settings, merging global defaults with org-specific overrides.
 * If orgId is provided, org-specific values take precedence over global ones.
 */
export async function getAppSettings(orgId?: string): Promise<Record<string, string>> {
    // Fetch global settings (org_id IS NULL)
    const { data: globalRows } = await supabaseAdmin
        .from("app_settings")
        .select("key, value")
        .is("org_id", null);

    const settings: Record<string, string> = {};
    for (const row of globalRows || []) {
        settings[row.key] = row.value;
    }

    // If orgId provided, fetch org-specific settings and override
    if (orgId) {
        const { data: orgRows } = await supabaseAdmin
            .from("app_settings")
            .select("key, value")
            .eq("org_id", orgId);

        for (const row of orgRows || []) {
            settings[row.key] = row.value;
        }
    }

    return settings;
}

/**
 * Fetches a single app setting value.
 * Checks org-specific value first, then falls back to global, then defaultValue.
 */
export async function getAppSetting(
    key: string,
    defaultValue: string = "",
    orgId?: string
): Promise<string> {
    // Try org-specific first
    if (orgId) {
        const { data: orgRow } = await supabaseAdmin
            .from("app_settings")
            .select("value")
            .eq("key", key)
            .eq("org_id", orgId)
            .maybeSingle();

        if (orgRow?.value) return orgRow.value;
    }

    // Fall back to global
    const { data: globalRow } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", key)
        .is("org_id", null)
        .maybeSingle();

    return globalRow?.value ?? defaultValue;
}
