// POST /api/agent-tools/desk/tick — the Desk ticket engine's reconciler, called every minute by the
// backend cron. src/proxy.ts already gates every /api/agent-tools/** path with the service token
// (403 without it), so this handler reads no body, no query string and no header. It answers
// { ok: true, data } with HTTP 200 for every run that reaches it, including a skipped one.

import { NextResponse } from 'next/server';
import { createSupabaseDeskRepo } from '@/lib/desk/repo-supabase';
import { runDeskTick } from '@/lib/desk/tick';
import type { DeskEnvelope } from '@/lib/desk/contracts';
import type { DeskTickResult } from '@/lib/desk/types';

export const maxDuration = 30;

export async function POST(): Promise<NextResponse> {
    try {
        const repo = createSupabaseDeskRepo({ runSignal: AbortSignal.timeout(26_000) });
        const data = await runDeskTick({ repo });
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
