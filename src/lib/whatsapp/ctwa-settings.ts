/**
 * Helper to read Facebook/CTWA configuration from app_settings (DB) with
 * environment-variable fallback. Used by all CTWA API routes so values
 * configured in the admin Settings UI are respected at runtime.
 */

import { supabaseAdmin } from "@/lib/whatsapp/supabase";

export interface CTWASettings {
    facebookAppId: string;
    facebookAppSecret: string;
    facebookOauthRedirectUri: string;
    metaApiVersion: string;
}

let _cache: { settings: CTWASettings; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Fetches CTWA-related settings from `app_settings` table, falling back to
 * environment variables when a value is not set in the DB.
 * Results are cached for 1 minute to avoid per-request DB lookups.
 */
export async function getCTWASettings(): Promise<CTWASettings> {
    // Return cached if still fresh
    if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
        return _cache.settings;
    }

    const keys = [
        "facebook_app_id",
        "facebook_app_secret",
        "facebook_oauth_redirect_uri",
        "meta_api_version",
    ];

    const dbSettings: Record<string, string> = {};

    try {
        const { data } = await supabaseAdmin
            .from("app_settings")
            .select("key, value")
            .in("key", keys);

        for (const row of data || []) {
            if (row.value) {
                dbSettings[row.key] = row.value;
            }
        }
    } catch (err) {
        console.warn("[ctwa-settings] Failed to fetch from DB, using env vars:", err);
    }

    const settings: CTWASettings = {
        facebookAppId:
            dbSettings.facebook_app_id || process.env.FACEBOOK_APP_ID || "",
        facebookAppSecret:
            dbSettings.facebook_app_secret || process.env.FACEBOOK_APP_SECRET || "",
        facebookOauthRedirectUri:
            dbSettings.facebook_oauth_redirect_uri || process.env.FACEBOOK_OAUTH_REDIRECT_URI || "",
        metaApiVersion:
            dbSettings.meta_api_version || process.env.META_API_VERSION || "v21.0",
    };

    _cache = { settings, fetchedAt: Date.now() };
    return settings;
}

/**
 * Clears the settings cache, forcing the next call to re-read from DB.
 * Call this after the settings page saves new values.
 */
export function invalidateCTWASettingsCache() {
    _cache = null;
}
