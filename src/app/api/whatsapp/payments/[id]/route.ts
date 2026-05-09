import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { getRequestContext } from "@/lib/whatsapp/request";

// ─── GET /api/payments/[id] ───────────────────────────────
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId } = getRequestContext(request.headers);
    const { id } = await params;

    const { data, error } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({
        id: data.id,
        contactId: data.contact_id,
        conversationId: data.conversation_id,
        contactName: data.contact_name,
        phone: data.phone,
        amount: Number(data.amount),
        currency: data.currency,
        description: data.description,
        razorpayLinkId: data.razorpay_link_id,
        razorpayPaymentId: data.razorpay_payment_id,
        shortUrl: data.short_url,
        transactionRef: data.transaction_ref,
        messageStatus: data.message_status,
        paymentStatus: data.payment_status,
        createdBy: data.created_by,
        integratedNumber: data.integrated_number,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    });
}

// ─── PATCH /api/payments/[id] ─────────────────────────────
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { orgId } = getRequestContext(request.headers);
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (body.paymentStatus) updateData.payment_status = body.paymentStatus;
    if (body.messageStatus) updateData.message_status = body.messageStatus;
    if (body.razorpayPaymentId)
        updateData.razorpay_payment_id = body.razorpayPaymentId;
    if (body.transactionRef !== undefined)
        updateData.transaction_ref = body.transactionRef;

    const { data, error } = await supabaseAdmin
        .from("payments")
        .update(updateData)
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single();

    if (error || !data) {
        return NextResponse.json(
            { error: "Failed to update payment" },
            { status: 500 }
        );
    }

    return NextResponse.json({
        id: data.id,
        paymentStatus: data.payment_status,
        transactionRef: data.transaction_ref,
        shortUrl: data.short_url,
        updatedAt: data.updated_at,
    });
}
