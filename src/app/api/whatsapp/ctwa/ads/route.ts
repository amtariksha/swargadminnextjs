import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getCTWASettings } from "@/lib/whatsapp/ctwa-settings";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── GET /api/ctwa/ads ───────────────────────────────────────
// Returns synced CTWA ads/campaigns from DB
export async function GET(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);

    let query = supabaseAdmin
        .from("ctwa_ads")
        .select("*")
        .order("synced_at", { ascending: false });

    if (!isSuperAdmin) {
        query = query.eq("org_id", orgId);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
        (data || []).map((ad) => ({
            id: ad.id,
            adAccountId: ad.ad_account_id,
            campaignId: ad.campaign_id,
            campaignName: ad.campaign_name,
            adsetId: ad.adset_id,
            adsetName: ad.adset_name,
            adId: ad.ad_id,
            adName: ad.ad_name,
            status: ad.status,
            objective: ad.objective,
            impressions: Number(ad.impressions),
            clicks: Number(ad.clicks),
            spend: Number(ad.spend),
            leads: ad.leads,
            syncedAt: ad.synced_at,
        }))
    );
}

// ─── POST /api/ctwa/ads ──────────────────────────────────────
// Sync campaigns from Meta Marketing API
export async function POST(request: NextRequest) {
    const { orgId, isSuperAdmin } = getRequestContext(request.headers);

    // Get CTWA config
    let configQuery = supabaseAdmin
        .from("ctwa_config")
        .select("*");

    if (!isSuperAdmin) {
        configQuery = configQuery.eq("org_id", orgId);
    }

    const { data: config } = await configQuery.limit(1).maybeSingle();

    if (!config) {
        return NextResponse.json(
            { error: "Not connected to Facebook" },
            { status: 400 }
        );
    }

    if (!config.ad_account_id) {
        return NextResponse.json(
            { error: "No ad account selected" },
            { status: 400 }
        );
    }

    const { metaApiVersion } = await getCTWASettings();

    try {
        // Fetch campaigns from Meta
        const campaignsRes = await fetch(
            `https://graph.facebook.com/${metaApiVersion}/${config.ad_account_id}/campaigns?` +
            `fields=name,status,objective&limit=100&access_token=${config.access_token}`
        );
        const campaignsData = await campaignsRes.json();

        if (campaignsData.error) {
            console.error("[CTWA Ads Sync] Meta API error:", campaignsData.error);
            return NextResponse.json(
                { error: campaignsData.error.message || "Meta API error" },
                { status: 502 }
            );
        }

        const campaigns = campaignsData.data || [];
        let syncedCount = 0;

        for (const campaign of campaigns) {
            // Fetch insights for each campaign
            let impressions = 0;
            let clicks = 0;
            let spend = 0;

            try {
                const insightsRes = await fetch(
                    `https://graph.facebook.com/${metaApiVersion}/${campaign.id}/insights?` +
                    `fields=impressions,clicks,spend&date_preset=maximum&access_token=${config.access_token}`
                );
                const insightsData = await insightsRes.json();

                if (insightsData.data && insightsData.data.length > 0) {
                    impressions = parseInt(insightsData.data[0].impressions || "0", 10);
                    clicks = parseInt(insightsData.data[0].clicks || "0", 10);
                    spend = parseFloat(insightsData.data[0].spend || "0");
                }
            } catch (err) {
                console.warn(`[CTWA Ads Sync] Failed to fetch insights for campaign ${campaign.id}:`, err);
            }

            // Count leads from ctwa_logs for this campaign
            const { count: leadCount } = await supabaseAdmin
                .from("ctwa_logs")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("campaign_name", campaign.name);

            // Upsert campaign
            await supabaseAdmin
                .from("ctwa_ads")
                .upsert(
                    {
                        org_id: orgId,
                        ad_account_id: config.ad_account_id,
                        campaign_id: campaign.id,
                        campaign_name: campaign.name,
                        status: campaign.status,
                        objective: campaign.objective,
                        impressions,
                        clicks,
                        spend,
                        leads: leadCount || 0,
                        synced_at: new Date().toISOString(),
                    },
                    { onConflict: "ad_account_id,campaign_id" }
                );

            syncedCount++;
        }

        console.log(`[CTWA Ads Sync] Synced ${syncedCount} campaigns`);

        return NextResponse.json({
            success: true,
            synced: syncedCount,
        });
    } catch (err) {
        console.error("[CTWA Ads Sync] Network error:", err);
        return NextResponse.json(
            { error: "Failed to connect to Meta API" },
            { status: 500 }
        );
    }
}
