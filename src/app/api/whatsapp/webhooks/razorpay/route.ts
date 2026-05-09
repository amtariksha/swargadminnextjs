import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import crypto from "crypto";

// ─── POST /api/webhooks/razorpay ──────────────────────────
// Razorpay sends payment events here when payment status changes
export async function POST(request: NextRequest) {
    const secret = process.env.RAZORPAY_KEY_SECRET;

    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    // ─── Verify webhook signature ────────────────────────────
    if (secret && signature) {
        const expectedSig = crypto
            .createHmac("sha256", secret)
            .update(rawBody)
            .digest("hex");

        if (signature !== expectedSig) {
            console.error("Razorpay webhook signature mismatch");
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    // ─── Handle payment link events ──────────────────────────
    if (event === "payment_link.paid") {
        const linkEntity = payload.payload?.payment_link?.entity;
        const paymentEntity = payload.payload?.payment?.entity;

        if (linkEntity?.id) {
            const { error } = await supabaseAdmin
                .from("payments")
                .update({
                    payment_status: "paid",
                    razorpay_payment_id: paymentEntity?.id || null,
                    updated_at: new Date().toISOString(),
                })
                .eq("razorpay_link_id", linkEntity.id);

            if (error) {
                console.error("Webhook update error:", error);
            }
        }
    } else if (event === "payment_link.cancelled") {
        const linkEntity = payload.payload?.payment_link?.entity;
        if (linkEntity?.id) {
            await supabaseAdmin
                .from("payments")
                .update({
                    payment_status: "cancelled",
                    updated_at: new Date().toISOString(),
                })
                .eq("razorpay_link_id", linkEntity.id);
        }
    } else if (event === "payment_link.expired") {
        const linkEntity = payload.payload?.payment_link?.entity;
        if (linkEntity?.id) {
            await supabaseAdmin
                .from("payments")
                .update({
                    payment_status: "expired",
                    updated_at: new Date().toISOString(),
                })
                .eq("razorpay_link_id", linkEntity.id);
        }
    }

    return NextResponse.json({ status: "ok" });
}
