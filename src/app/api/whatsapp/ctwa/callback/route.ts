import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getCTWASettings } from "@/lib/whatsapp/ctwa-settings";

// ─── GET /api/ctwa/callback ──────────────────────────────────
// Facebook OAuth redirect handler
export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get("code");
    const error = request.nextUrl.searchParams.get("error");

    if (error) {
        console.error("[CTWA Callback] OAuth error:", error);
        const baseUrl = request.nextUrl.origin;
        return NextResponse.redirect(`${baseUrl}/ad-campaigns?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
        const baseUrl = request.nextUrl.origin;
        return NextResponse.redirect(`${baseUrl}/ad-campaigns?error=no_code`);
    }

    const {
        facebookAppId: appId,
        facebookAppSecret: appSecret,
        facebookOauthRedirectUri: redirectUri,
        metaApiVersion,
    } = await getCTWASettings();

    if (!appId || !appSecret || !redirectUri) {
        console.error("[CTWA Callback] Missing Facebook config (check Settings → General)");
        const baseUrl = request.nextUrl.origin;
        return NextResponse.redirect(`${baseUrl}/ad-campaigns?error=config_missing`);
    }

    try {
        // Step 1: Exchange code for short-lived token
        const tokenRes = await fetch(
            `https://graph.facebook.com/${metaApiVersion}/oauth/access_token?` +
            `client_id=${appId}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&client_secret=${appSecret}` +
            `&code=${code}`
        );
        const tokenData = await tokenRes.json();

        if (tokenData.error) {
            console.error("[CTWA Callback] Token exchange error:", tokenData.error);
            const baseUrl = request.nextUrl.origin;
            return NextResponse.redirect(`${baseUrl}/ad-campaigns?error=token_exchange_failed`);
        }

        const shortLivedToken = tokenData.access_token;

        // Step 2: Exchange for long-lived token
        const longLivedRes = await fetch(
            `https://graph.facebook.com/${metaApiVersion}/oauth/access_token?` +
            `grant_type=fb_exchange_token` +
            `&client_id=${appId}` +
            `&client_secret=${appSecret}` +
            `&fb_exchange_token=${shortLivedToken}`
        );
        const longLivedData = await longLivedRes.json();

        if (longLivedData.error) {
            console.error("[CTWA Callback] Long-lived token error:", longLivedData.error);
            const baseUrl = request.nextUrl.origin;
            return NextResponse.redirect(`${baseUrl}/ad-campaigns?error=long_lived_token_failed`);
        }

        const accessToken = longLivedData.access_token;

        // Step 3: Fetch user info
        const meRes = await fetch(
            `https://graph.facebook.com/${metaApiVersion}/me?access_token=${accessToken}`
        );
        const meData = await meRes.json();

        // Step 4: Fetch ad accounts
        const adAccountsRes = await fetch(
            `https://graph.facebook.com/${metaApiVersion}/me/adaccounts?fields=name,account_id,account_status&access_token=${accessToken}`
        );
        const adAccountsData = await adAccountsRes.json();

        const adAccounts = (adAccountsData.data || []).map((acc: Record<string, unknown>) => ({
            id: acc.id,
            name: acc.name,
            accountId: acc.account_id,
            status: acc.account_status,
        }));

        // Step 5: Upsert into ctwa_config
        // First delete any existing config
        await supabaseAdmin.from("ctwa_config").delete().neq("id", "00000000-0000-0000-0000-000000000000");

        // Then insert new config
        const firstAdAccount = adAccounts.length > 0 ? adAccounts[0] : null;
        const { error: insertError } = await supabaseAdmin.from("ctwa_config").insert({
            facebook_user_id: meData.id,
            facebook_name: meData.name,
            access_token: accessToken,
            ad_account_id: firstAdAccount?.id || null,
            ad_account_name: firstAdAccount?.name || null,
        });

        if (insertError) {
            console.error("[CTWA Callback] DB insert error:", insertError);
            const baseUrl = request.nextUrl.origin;
            return NextResponse.redirect(`${baseUrl}/ad-campaigns?error=db_error`);
        }

        console.log(`[CTWA Callback] Connected as ${meData.name} (${meData.id}), ${adAccounts.length} ad account(s)`);

        const baseUrl = request.nextUrl.origin;
        return NextResponse.redirect(`${baseUrl}/ad-campaigns?connected=true`);
    } catch (err) {
        console.error("[CTWA Callback] Network error:", err);
        const baseUrl = request.nextUrl.origin;
        return NextResponse.redirect(`${baseUrl}/ad-campaigns?error=network_error`);
    }
}
