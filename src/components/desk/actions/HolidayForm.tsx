'use client';

// Holiday for the matched customer: one backend call (pauses every subscription), then one record.
// A retry after the backend call succeeded never calls the backend again.

import { useMemo, useState } from 'react';
import { CalendarOff } from 'lucide-react';
import { dateInputClassName } from '@/components/FormField';
import { POST } from '@/lib/api';
import { newClientActionId } from '@/lib/desk/action-client';
import type { DeskActionContext } from '@/lib/desk/action-context';
import type { TicketActionBody } from '@/lib/desk/contracts';
import {
    buildHolidayBody, checkHolidayRange, holidayAvailability, holidayEarliestDate, holidayErrorText, holidayRangeText,
    istDateAfter, planOpsResolution, recordOnlyBody, resolveFragment, type RecordFailure,
} from '@/lib/desk/ops-actions';
import { useDeskCategories } from '@/lib/desk/ticket-hooks';
import { ActionDrawer } from './ActionDrawer';
import { CloseGuardDialog, FailureNotice, ResolveChoice, useCloseGuard, useRecordAndClose, useResolveChoice } from './OpsRecord';

const BUTTON = 'rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50';
const TITLES = {
    no_customer: 'No customer matched yet', no_subscriptions: 'No active subscription to pause',
} as const;

interface FlowProps { ctx: DeskActionContext; userId: number; name: string | null; nowMs: number; onDone: () => void }

function HolidayFlow({ ctx, userId, name, nowMs, onDone }: FlowProps) {
    const [seen] = useState(() => ctx.seenInboundAt);
    const [clientActionId] = useState(newClientActionId);
    const earliest = holidayEarliestDate(nowMs, ctx.snapshot.tomorrow);
    const [from, setFrom] = useState(earliest);
    const [to, setTo] = useState(earliest);
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [last, setLast] = useState<{ body: TicketActionBody; failure: RecordFailure } | null>(null);
    const categories = useDeskCategories();
    const plan = useMemo(() => planOpsResolution('holiday_added', ctx.ticket, categories.items), [ctx.ticket, categories.items]);
    const [choice, setChoice] = useResolveChoice(plan.initial);
    const recorder = useRecordAndClose(ctx, onDone);
    const existing = ctx.snapshot.holidays.map((item) => item.date);
    const check = checkHolidayRange(from, to, earliest, existing);
    const guard = useCloseGuard(last?.failure ?? null, onDone);

    const record = async (body: TicketActionBody) => {
        const failure = await recorder.record(body);
        setLast(failure === null ? null : { body, failure });
    };
    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            if (!saved) {
                try {
                    await POST('/add_user_holiday_multiple', { user_id: userId, date: from, end_date: to });
                    setSaved(true);
                } catch (cause) {
                    setError(holidayErrorText(cause));
                    return;
                }
            }
            await record(buildHolidayBody(
                { client_action_id: clientActionId, seen_inbound_at: seen },
                resolveFragment(choice, ctx.ticket, ctx.detail.events), { userId, from, to },
            ));
        } finally {
            setBusy(false);
        }
    };
    const retry = async (body: TicketActionBody) => {
        setBusy(true);
        try { await record(body); } finally { setBusy(false); }
    };

    return (
        <ActionDrawer title="Holiday" open onClose={guard.requestClose} closable={!busy && !guard.confirming} suspended={guard.confirming}>
            <div className="space-y-3 text-sm text-slate-300">
                <p>Pauses every subscription of {name ?? 'this customer'} ({ctx.snapshot.subscriptions.length} active).</p>
                {existing.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {existing.slice(0, 10).map((date) => <span key={date} className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">{date}</span>)}
                    </div>
                ) : null}
                {earliest === istDateAfter(nowMs, 2) ? (
                    <p className="text-xs text-amber-300">
                        Tomorrow can no longer be paused: the {ctx.snapshot.tomorrow.cutoff} cutoff has passed or tomorrow&apos;s list is already generated.
                    </p>
                ) : null}
                <label className="block space-y-1"><span>From</span>
                    <input type="date" min={earliest} value={from} disabled={saved} className={dateInputClassName} onChange={(event) => setFrom(event.target.value)} />
                </label>
                <label className="block space-y-1"><span>To</span>
                    <input type="date" min={from} value={to} disabled={saved} className={dateInputClassName} onChange={(event) => setTo(event.target.value)} />
                </label>
                {check !== 'ok' && from !== '' && to !== '' ? <p className="text-xs text-amber-300">{holidayRangeText(check, earliest)}</p> : null}
                <ResolveChoice plan={plan} current={ctx.category} value={choice} onChange={setChoice} disabled={busy || saved} />
                {error ? <p className="text-red-400">{error}</p> : null}
                {last !== null ? (
                    <FailureNotice failure={last.failure} onRetry={() => { void retry(last.body); }}
                        onRecordOnly={() => { void retry(recordOnlyBody(last.body)); }} />
                ) : (
                    <button type="button" disabled={check !== 'ok' || busy || categories.isPending} onClick={() => { void submit(); }}
                        className="w-full rounded-xl bg-green-600 px-3 py-2 text-white disabled:opacity-50">
                        {busy ? 'Working…' : 'Add holiday'}
                    </button>
                )}
            </div>
            <CloseGuardDialog guard={guard} onDone={onDone} message="The holiday is saved in the backend but not on this ticket. Close anyway?" />
        </ActionDrawer>
    );
}

interface HolidayOpening { openedAt: number; userId: number; name: string | null }

export function HolidayAction({ ctx, offer }: { ctx: DeskActionContext; offer: boolean }) {
    const [opening, setOpening] = useState<HolidayOpening | null>(null);
    const availability = holidayAvailability(ctx.snapshot);
    const profile = ctx.snapshot.profile;
    const disabled = availability !== 'ok' || profile === null;
    return (
        <>
            {offer && availability !== 'staff' ? (
                <button type="button" className={BUTTON} disabled={disabled}
                    title={availability === 'no_customer' || availability === 'no_subscriptions' ? TITLES[availability] : undefined}
                    onClick={() => { if (profile !== null) setOpening({ openedAt: Date.now(), userId: profile.user_id, name: profile.name }); }}>
                    <CalendarOff className="mr-1 inline h-3 w-3" />Holiday
                </button>
            ) : null}
            {opening !== null ? (
                <HolidayFlow key={opening.openedAt} ctx={ctx} userId={opening.userId} name={opening.name} nowMs={opening.openedAt}
                    onDone={() => setOpening(null)} />
            ) : null}
        </>
    );
}
