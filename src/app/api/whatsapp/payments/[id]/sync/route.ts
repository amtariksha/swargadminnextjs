import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getAppSetting } from "@/lib/whatsapp/settings";

// ─── POST /api/payments/[id]/sync ─────────────────────────────
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId } = getRequestContext(request.headers);
    const { id } = await params;

    // 1. Fetch payment from DB
    const { data: payment, error } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !payment) {
        return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (!payment.razorpay_link_id) {
        return NextResponse.json({ error: "No Razorpay link ID associated with this payment" }, { status: 400 });
    }

    const keyId = await getAppSetting("razorpay_key_id", process.env.RAZORPAY_KEY_ID || "", orgId);
    const keySecret = await getAppSetting("razorpay_key_secret", process.env.RAZORPAY_KEY_SECRET || "", orgId);

    if (!keyId || !keySecret) {
        return NextResponse.json({ error: "Razorpay credentials not configured. Set them in Settings or as environment variables." }, { status: 500 });
    }

    try {
        // 2. Fetch latest status from Razorpay
        const rpResponse = await fetch(
            `https://api.razorpay.com/v1/payment_links/${payment.razorpay_link_id}`,
            {
                method: "GET",
                headers: {
                    Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
                }
            }
        );

        if (!rpResponse.ok) {
            const errorText = await rpResponse.text();
            console.error("Razorpay fetch error:", errorText);
            return NextResponse.json({ error: "Failed to fetch from Razorpay" }, { status: 500 });
        }

        const rpData = await rpResponse.json();
        const rpStatus = rpData.status; // e.g., 'created', 'partially_paid', 'paid', 'cancelled', 'expired'

        // Map Razorpay status to our DB status
        let localStatus = payment.payment_status;
        if (rpStatus === "paid") localStatus = "paid";
        else if (rpStatus === "cancelled") localStatus = "cancelled";
        else if (rpStatus === "expired") localStatus = "expired";

        // 3. Update DB if status changed
        if (localStatus !== payment.payment_status) {
            const updateData: any = {
                payment_status: localStatus,
                updated_at: new Date().toISOString(),
            };

            // If paid, try to extract payment ID
            if (rpStatus === "paid" && rpData.payments && rpData.payments.length > 0) {
                updateData.razorpay_payment_id = rpData.payments[0].payment_id;
            }

            await supabaseAdmin
                .from("payments")
                .update(updateData)
                .eq("id", id);
        }

        return NextResponse.json({
            success: true,
            status: localStatus,
        });

    } catch (err) {
        console.error("Manual sync error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
