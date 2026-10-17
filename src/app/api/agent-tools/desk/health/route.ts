// GET /api/agent-tools/desk/health — installed / canWrite / flags / last tick, for the operator and
// the backend. Service-token gated by src/proxy.ts. Writes nothing and never returns a secret; it
// answers 200 even when Desk is not installed (that is a field, not an error).

import { NextResponse } from 'next/server';
import { createSupabaseDeskRepo } from '@/lib/desk/repo-supabase';
import { buildDeskHealth } from '@/lib/desk/health';
import type { DeskEnvelope } from '@/lib/desk/contracts';
import type { DeskHealth } from '@/lib/desk/types';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
    const repo = createSupabaseDeskRepo({ runSignal: AbortSignal.timeout(8_000) });
    const data = await buildDeskHealth({ repo, now: new Date() });
    const body: DeskEnvelope<DeskHealth> = { ok: true, data };
    return NextResponse.json(body);
}
