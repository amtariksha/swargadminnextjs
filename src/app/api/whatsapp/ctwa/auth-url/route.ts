import { NextResponse } from "next/server";
import { getCTWASettings } from "@/lib/whatsapp/ctwa-settings";

// ─── GET /api/ctwa/auth-url ──────────────────────────────────
// Returns the Facebook OAuth authorization URL
export async function GET() {
    const { facebookAppId, facebookOauthRedirectUri, metaApiVersion } =
        await getCTWASettings();

    if (!facebookAppId || !facebookOauthRedirectUri) {
        return NextResponse.json(
            { error: "Facebook App ID or OAuth Redirect URI not configured. Set them in Settings → General." },
            { status: 500 }
        );
    }

    const scopes = [
        "ads_read",
        "pages_read_engagement",
        "business_management",
    ].join(",");

    const state = JSON.stringify({ action: "ctwa_connect" });

    const url = `https://www.facebook.com/${metaApiVersion}/dialog/oauth?` +
        `client_id=${facebookAppId}` +
        `&redirect_uri=${encodeURIComponent(facebookOauthRedirectUri)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&response_type=code` +
        `&state=${encodeURIComponent(state)}`;

    return NextResponse.json({ url });
}
