/**
 * DELETE /api/lms/tags/[tagId] — delete tag (CASCADE removes assignments)
 */

import { NextRequest, NextResponse } from "next/server";
import { deleteTag } from "@/lib/lms/tags/service";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ tagId: string }> },
) {
    const { tagId } = await params;
    try {
        await deleteTag({ tagId });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[DELETE /api/lms/tags/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
