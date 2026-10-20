// POST /api/agent-tools/whatsapp/replay — feeds inbound webhook calls that failed or never finished
// (public.webhook_debug journal rows, migration 017c) back through the two webhook handlers.
// src/proxy.ts already gates every /api/agent-tools/** path with the service token (403 without
// it). No body, no query and no header is read. Triggered manually (operator curl) in Slice 2.
// Answers { ok: true, data: { scanned, replayed, failed } }, or 503 not_installed before 017c.

import { NextResponse } from "next/server";
import { POST as msg91Webhook } from "@/app/api/whatsapp/webhooks/msg91/route";
import { POST as metaWebhook } from "@/app/api/whatsapp/webhooks/meta/route";
import { JournalNotInstalledError, replayJournal } from "@/lib/whatsapp/webhook-journal";

export const maxDuration = 60;

export async function POST(): Promise<NextResponse> {
    try {
        const data = await replayJournal({ handlers: { msg91: msg91Webhook, meta: metaWebhook } });
        return NextResponse.json({ ok: true, data });
    } catch (err) {
        if (err instanceof JournalNotInstalledError) {
            return NextResponse.json({ ok: false, error: { code: "not_installed", message: "Migration 017c is not applied." } }, { status: 503 });
        }
        console.error("[whatsapp-replay] failed", err instanceof Error ? err.name : "Error");
        return NextResponse.json({ ok: false, error: { code: "internal_error", message: "Replay failed." } }, { status: 500 });
    }
}
