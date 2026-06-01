import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

// ─── POST /api/numbers/fetch-msg91 ────────────────────────
// Auto-detect WhatsApp numbers from MSG91 account and import them
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
        // Fetch numbers from MSG91 (whatsapp-activation endpoint)
        const response = await fetch(
            "https://control.msg91.com/api/v5/whatsapp/whatsapp-activation/",
            {
                method: "GET",
                headers: {
                    authkey: authKey,
                    accept: "application/json",
                },
            }
        );

        const responseText = await response.text();
        console.log("[Fetch Numbers] MSG91 response:", response.status, responseText);

        if (!response.ok) {
            return NextResponse.json(
                { error: "Failed to fetch numbers from MSG91", details: responseText },
                { status: response.status }
            );
        }

        let msg91Data: any;
        try {
            msg91Data = JSON.parse(responseText);
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON response from MSG91", raw: responseText },
                { status: 502 }
            );
        }

        // MSG91 may return numbers in different structures
        // Handle common shapes: { data: [...] }, { numbers: [...] }, or direct array
        let rawNumbers: any[] = [];
        if (Array.isArray(msg91Data)) {
            rawNumbers = msg91Data;
        } else if (Array.isArray(msg91Data?.data)) {
            rawNumbers = msg91Data.data;
        } else if (Array.isArray(msg91Data?.numbers)) {
            rawNumbers = msg91Data.numbers;
        } else if (msg91Data?.data && typeof msg91Data.data === "object") {
            // Might be a single number object
            rawNumbers = [msg91Data.data];
        }

        if (rawNumbers.length === 0) {
            return NextResponse.json({
                numbers: [],
                imported: 0,
                message: "No numbers found in MSG91 account",
            });
        }

        // Extract phone numbers from the response
        const phoneNumbers = rawNumbers.map((n: any) => {
            const phone = (
                n.phone_number ||
                n.phoneNumber ||
                n.number ||
                n.integrated_number ||
                n.display_phone_number ||
                (typeof n === "string" ? n : "")
            )
                .toString()
                .replace(/^\+/, "")
                .trim();
            const name =
                n.verified_name ||
                n.display_name ||
                n.name ||
                n.label ||
                "";
            return { phone, name };
        }).filter((n: { phone: string }) => n.phone.length > 0);

        // Get existing numbers to avoid duplicates
        const { data: existingNumbers } = await supabaseAdmin
            .from("integrated_numbers")
            .select("number");

        const existingSet = new Set(
            (existingNumbers || []).map((n) => n.number)
        );

        // Insert new numbers
        let imported = 0;
        for (const num of phoneNumbers) {
            if (existingSet.has(num.phone)) continue;

            const { error } = await supabaseAdmin
                .from("integrated_numbers")
                .insert({
                    number: num.phone,
                    label: num.name || `MSG91 ${num.phone.slice(-4)}`,
                    provider: "msg91",
                    active: true,
                });

            if (!error) {
                imported++;
                existingSet.add(num.phone);
            } else {
                console.warn("[Fetch Numbers] Insert error for", num.phone, error.message);
            }
        }

        return NextResponse.json({
            numbers: phoneNumbers,
            imported,
            total: phoneNumbers.length,
        });
    } catch (err) {
        console.error("[Fetch Numbers] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch numbers from MSG91" },
            { status: 500 }
        );
    }
}
