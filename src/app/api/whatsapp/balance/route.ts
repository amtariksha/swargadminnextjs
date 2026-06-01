import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

// ─── GET /api/balance ─────────────────────────────────────
// Check MSG91 WhatsApp prepaid balance
// Docs: https://docs.msg91.com/whatsapp/check-whatsapp-prepaid-balance
export async function GET(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);
    const authKey = await getAppSetting("msg91_auth_key", process.env.MSG91_AUTH_KEY || "", orgId);
    if (!authKey) {
        return NextResponse.json(
            { error: "MSG91 Auth Key not configured. Set it in Settings or as MSG91_AUTH_KEY env variable." },
            { status: 500 }
        );
    }

    // Get the integrated number — needed for balance check
    const { data: numRow } = await supabaseAdmin
        .from("integrated_numbers")
        .select("number")
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    const integratedNumber = numRow?.number || "";
    if (!integratedNumber) {
        return NextResponse.json(
            { error: "No integrated WhatsApp number configured." },
            { status: 400 }
        );
    }

    try {
        // MSG91 prepaid balance endpoint
        const response = await fetch(
            "https://control.msg91.com/api/v5/subscriptions/fetchPrepaidBalance",
            {
                method: "POST",
                headers: {
                    authkey: authKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    integrated_number: integratedNumber,
                    service: "whatsapp",
                }),
            }
        );

        const responseText = await response.text();
        console.log("[Balance] MSG91 response:", response.status, responseText);

        if (!response.ok) {
            return NextResponse.json(
                { error: "Failed to check balance", details: responseText },
                { status: response.status }
            );
        }

        let data: any;
        try {
            data = JSON.parse(responseText);
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON response from MSG91", raw: responseText },
                { status: 502 }
            );
        }

        if (data?.hasError || data?.status === "error") {
            console.error("[Balance] MSG91 API error:", data);
            return NextResponse.json(
                { error: data.errors || data.message || "MSG91 balance check failed", raw: data },
                { status: 502 }
            );
        }

        // Extract balance from various possible response shapes
        const balance =
            data?.prepaid_balance ??
            data?.balance ??
            data?.data?.prepaid_balance ??
            data?.data?.balance ??
            data?.wallet_balance ??
            data?.data?.wallet_balance ??
            null;

        const currency =
            data?.currency ??
            data?.data?.currency ??
            "INR";

        return NextResponse.json({
            balance: balance !== null ? Number(balance) : null,
            currency,
            raw: data,
        });
    } catch (err) {
        console.error("[Balance] Error:", err);
        return NextResponse.json(
            { error: "Failed to check balance" },
            { status: 500 }
        );
    }
}
