/**
 * DELETE /api/lms/tags/[tagId] — delete tag (CASCADE removes assignments)
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/whatsapp/request";
import { deleteTag } from "@/lib/lms/tags/service";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ tagId: string }> },
) {
    const { tagId } = await params;
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }
    try {
        await deleteTag({ orgId, tagId });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[DELETE /api/lms/tags/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
