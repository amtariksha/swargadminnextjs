/**
 * POST /api/lms/journeys/install
 *
 * One-click installer for the pre-built journey templates. Idempotent —
 * re-running registers a higher version if the DSL changed, leaves the
 * existing version alone if it didn't.
 *
 * Body (optional): { names: ["welcome", "replenishment_ghee", ...] }
 *   — if omitted, installs ALL templates.
 *
 * Templates ship inactive — operator must call /toggle to enable.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/whatsapp/request";
import { findTemplate, JOURNEY_TEMPLATES } from "@/lib/lms/journeys/templates";
import { getJourneyByName, upsertJourney } from "@/lib/lms/journeys/service";

const bodySchema = z.object({
    names: z.array(z.string()).optional(),
    overwriteLatest: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const names = parsed.data.names ?? JOURNEY_TEMPLATES.map((t) => t.name);
    const installed: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const name of names) {
        const template = findTemplate(name);
        if (!template) {
            errors.push({ name, error: "Unknown template" });
            continue;
        }
        try {
            const existing = await getJourneyByName({ orgId, name });
            // Skip if existing version's DSL matches AND not overwriting.
            if (existing && !parsed.data.overwriteLatest) {
                const sameDsl =
                    JSON.stringify(existing.dsl) === JSON.stringify(template.dsl);
                if (sameDsl) {
                    skipped.push(name);
                    continue;
                }
            }
            await upsertJourney({
                orgId,
                name,
                triggerEvent: template.dsl.trigger,
                dsl: template.dsl,
                overwriteLatest: parsed.data.overwriteLatest,
            });
            installed.push(name);
        } catch (err) {
            errors.push({
                name,
                error: err instanceof Error ? err.message : "Unknown error",
            });
        }
    }
    return NextResponse.json({ installed, skipped, errors });
}
