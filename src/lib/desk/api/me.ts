// Routes 10 and 11: the caller's own view of Desk, and the health payload.

import { TICK_STALE_SECS } from '../constants';
import { buildDeskHealth } from '../health';
import { createSupabaseDeskRepo } from '../repo-supabase';
import type { DeskContext, DeskHealth, DeskMe } from '../types';

export function buildMe(ctx: DeskContext, now: Date): DeskMe {
    const { settings } = ctx;
    const lastTick = settings.last_tick_at;
    const tickStale = lastTick === null || (now.getTime() - Date.parse(lastTick)) / 1000 > TICK_STALE_SECS;
    return {
        ...ctx.rights,
        user: ctx.actor,
        ui_enabled: settings.ui_enabled,
        cutover_redirect: settings.cutover_redirect,
        ack_suppress: settings.ack_suppress,
        reply_alert_mins: settings.reply_alert_mins,
        credit_max_agent: settings.credit_max_agent,
        business_hours: settings.business_hours,
        last_tick_at: lastTick,
        tick_stale: tickStale,
    };
}

export function readHealth(): Promise<DeskHealth> {
    return buildDeskHealth({ repo: createSupabaseDeskRepo({ runSignal: AbortSignal.timeout(8_000) }), now: new Date() });
}
