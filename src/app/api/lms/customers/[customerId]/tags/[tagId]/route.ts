/**
 * DELETE /api/lms/customers/[customerId]/tags/[tagId] — unassign one tag
 */

import { NextRequest, NextResponse } from "next/server";
import { unassignTag } from "@/lib/lms/tags/service";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ customerId: string; tagId: string }> },
) {
    const { customerId, tagId } = await params;
    try {
        await unassignTag({ customerId, tagId });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[DELETE /api/lms/customers/:cid/tags/:tid]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
