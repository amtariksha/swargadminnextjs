/**
 * GET  /api/lms/tags                 — list tags (with active-assignment counts)
 * POST /api/lms/tags                 — create new tag
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    createTag,
    listTagsWithCounts,
    type TagNamespace,
} from "@/lib/lms/tags/service";

const NAMESPACES: TagNamespace[] = [
    "channel",
    "product",
    "festival",
    "context",
    "behaviour",
    "custom",
];

const createSchema = z.object({
    name: z.string().min(1).max(64),
    namespace: z.enum(NAMESPACES as [TagNamespace, ...TagNamespace[]]),
    color: z.string().max(32).optional(),
    autoRule: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_request: NextRequest) {
    try {
        const tags = await listTagsWithCounts();
        return NextResponse.json({ count: tags.length, tags });
    } catch (err) {
        console.error("[GET /api/lms/tags]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    try {
        const tag = await createTag({ ...parsed.data });
        return NextResponse.json({ tag }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/lms/tags]", err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        // Duplicate (UNIQUE org_id,namespace,name) becomes a 409.
        if (msg.includes("duplicate") || msg.includes("unique")) {
            return NextResponse.json({ error: "Tag already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
