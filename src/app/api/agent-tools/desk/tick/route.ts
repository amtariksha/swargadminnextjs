// POST /api/agent-tools/desk/tick — the Desk ticket engine's reconciler, called every minute by the
// backend cron. src/proxy.ts already gates every /api/agent-tools/** path with the service token
// (403 without it). The only input is the optional body { staff_phones } (P1e): a missing or invalid
// body means "no staff list", never an error. It answers { ok: true, data } with HTTP 200 for every
// run that reaches it, including a skipped one.

import { NextResponse } from 'next/server';
import { tickBody, type DeskEnvelope } from '@/lib/desk/contracts';
import { createSupabaseDeskRepo } from '@/lib/desk/repo-supabase';
import { runDeskTick } from '@/lib/desk/tick';
import type { DeskTickResult } from '@/lib/desk/types';

export const maxDuration = 30;

/** staff_phones of the body, or null when the body is absent, not JSON or does not match tickBody. */
async function readStaffPhones(request: Request): Promise<string[] | null> {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        // No body (an older backend) or not JSON: no automatic suppression this run.
        return null;
    }
    const parsed = tickBody.safeParse(raw);
    return parsed.success ? (parsed.data.staff_phones ?? null) : null;
}

export async function POST(request: Request): Promise<NextResponse> {
    try {
        const staffPhones = await readStaffPhones(request);
        const repo = createSupabaseDeskRepo({ runSignal: AbortSignal.timeout(26_000) });
        const data = await runDeskTick({ repo, staffPhones });
        const body: DeskEnvelope<DeskTickResult> = { ok: true, data };
        return NextResponse.json(body);
    } catch (err) {
        console.error('[desk-tick] route failed', err instanceof Error ? err.name : 'Error');
        const body: DeskEnvelope<DeskTickResult> = {
            ok: false,
            error: { code: 'internal_error', message: 'The Desk tick failed.' },
        };
        return NextResponse.json(body, { status: 500 });
    }
}
