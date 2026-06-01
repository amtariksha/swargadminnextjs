import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getCTWASettings } from "@/lib/whatsapp/ctwa-settings";

// ─── POST /api/meta/onboard ─────────────────────────────────
// Receives the authorization code from Meta Embedded Signup,
// exchanges it for an access token, discovers the shared WABA
// and phone numbers, subscribes to webhooks, and registers the
// phone (for coexistence mode).
export async function POST(request: NextRequest) {
    const { code, configId } = await request.json();

    if (!code) {
        return NextResponse.json({ error: "Authorization code is required" }, { status: 400 });
    }

    const { facebookAppId: appId, facebookAppSecret: appSecret, metaApiVersion } =
        await getCTWASettings();

    if (!appId || !appSecret) {
        return NextResponse.json(
            { error: "Facebook App ID / App Secret not configured. Set them in Settings → General." },
            { status: 500 }
        );
    }

    try {
        // Step 1: Exchange code for access token
        const tokenUrl = `https://graph.facebook.com/${metaApiVersion}/oauth/access_token?` +
            `client_id=${appId}` +
            `&client_secret=${appSecret}` +
            `&code=${code}`;
        const tokenRes = await fetch(tokenUrl);
        const tokenData = await tokenRes.json();

        if (tokenData.error) {
            console.error("[Meta Onboard] Token exchange error:", tokenData.error);
            return NextResponse.json({ error: "Token exchange failed: " + (tokenData.error.message || "Unknown") }, { status: 400 });
        }

        const accessToken = tokenData.access_token;

        // Step 2: Debug token to extract shared WABA IDs from granular_scopes
        const debugUrl = `https://graph.facebook.com/${metaApiVersion}/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`;
        const debugRes = await fetch(debugUrl);
        const debugData = await debugRes.json();

        const granularScopes = debugData.data?.granular_scopes || [];
        const wabaScope = granularScopes.find(
            (s: { scope: string }) => s.scope === "whatsapp_business_management"
        );
        const wabaIds: string[] = wabaScope?.target_ids || [];

        if (wabaIds.length === 0) {
            console.error("[Meta Onboard] No WABA IDs found in granular_scopes:", granularScopes);
            return NextResponse.json({ error: "No WhatsApp Business Account shared. Please grant access during signup." }, { status: 400 });
        }

        const results: Array<{
            phoneNumber: string;
            displayName: string;
            phoneNumberId: string;
            wabaId: string;
        }> = [];

        // Step 3: For each WABA, get phone numbers, subscribe, register
        for (const wabaId of wabaIds) {
            // Subscribe WABA to webhooks
            await fetch(`https://graph.facebook.com/${metaApiVersion}/${wabaId}/subscribed_apps`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            // Get phone numbers
            const phonesUrl = `https://graph.facebook.com/${metaApiVersion}/${wabaId}/phone_numbers?access_token=${accessToken}`;
            const phonesRes = await fetch(phonesUrl);
            const phonesData = await phonesRes.json();

            for (const phone of phonesData.data || []) {
                const phoneNumberId = phone.id;
                const displayPhoneNumber = phone.display_phone_number?.replace(/[^0-9]/g, "") || "";
                const displayName = phone.verified_name || phone.display_phone_number || "";

                // Register phone for coexistence (auto-generate 6-digit PIN)
                const pin = String(Math.floor(100000 + Math.random() * 900000));
                try {
                    await fetch(`https://graph.facebook.com/${metaApiVersion}/${phoneNumberId}/register`, {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            messaging_product: "whatsapp",
                            pin,
                        }),
                    });
                } catch (regErr) {
                    console.warn(`[Meta Onboard] Phone register failed for ${phoneNumberId}:`, regErr);
                    // Non-fatal — phone may already be registered
                }

                // Upsert into integrated_numbers
                const { data: existing } = await supabaseAdmin
                    .from("integrated_numbers")
                    .select("id")
                    .eq("meta_phone_number_id", phoneNumberId)
                    .maybeSingle();

                if (existing) {
                    await supabaseAdmin
                        .from("integrated_numbers")
                        .update({
                            number: displayPhoneNumber,
                            label: displayName,
                            provider: "meta",
                            meta_waba_id: wabaId,
                            meta_access_token: accessToken,
                            active: true,
                        })
                        .eq("id", existing.id);
                } else {
                    await supabaseAdmin
                        .from("integrated_numbers")
                        .insert({
                            number: displayPhoneNumber,
                            label: displayName,
                            provider: "meta",
                            meta_waba_id: wabaId,
                            meta_phone_number_id: phoneNumberId,
                            meta_access_token: accessToken,
                            active: true,
                        });
                }

                results.push({
                    phoneNumber: displayPhoneNumber,
                    displayName,
                    phoneNumberId,
                    wabaId,
                });
            }
        }

        console.log(`[Meta Onboard] Successfully onboarded ${results.length} number(s)`);

        return NextResponse.json({
            success: true,
            numbers: results,
            configId,
        });
    } catch (err) {
        console.error("[Meta Onboard] Error:", err);
        return NextResponse.json({ error: "Onboarding failed" }, { status: 500 });
    }
}
