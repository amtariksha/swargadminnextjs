/**
 * GET /api/lms/consent/notice/latest?lang=en
 *
 * Returns the most recent published Privacy Notice for a given language.
 * Public — no auth required. Used by:
 *   - The Flutter customer-app's Preference Center banner.
 *   - The web Preference Center page.
 *   - The signup flow.
 *   - Operators reviewing what version a customer agreed to.
 *
 * Notices are versioned MD files under src/content/privacy-notices/.
 * Adding a new notice version is a deploy, not a DB write.
 */

import { NextRequest, NextResponse } from "next/server";
import { getLatestNotice } from "@/lib/lms/consent/notice";
import type { PrivacyNotice } from "@/lib/lms/types";

const ALLOWED_LANGS: PrivacyNotice["language"][] = ["en", "kn", "hi"];

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const langParam = searchParams.get("lang") ?? "en";
    const lang = (
        ALLOWED_LANGS.includes(langParam as PrivacyNotice["language"])
            ? langParam
            : "en"
    ) as PrivacyNotice["language"];

    try {
        const notice = getLatestNotice(lang);
        return NextResponse.json({ notice });
    } catch (err) {
        console.error("[GET /api/lms/consent/notice/latest]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
