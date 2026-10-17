'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ComplaintsSection } from '@/components/desk/dashboard/ComplaintsSection';
import { MoneySection } from '@/components/desk/dashboard/MoneySection';
import { NowTiles } from '@/components/desk/dashboard/NowTiles';
import { QualitySection } from '@/components/desk/dashboard/QualitySection';
import { RepeatComplainersTable } from '@/components/desk/dashboard/RepeatComplainersTable';
import { SalesSection } from '@/components/desk/dashboard/SalesSection';
import { TimingSection } from '@/components/desk/dashboard/TimingSection';
import { VolumeSection } from '@/components/desk/dashboard/VolumeSection';
import { DeskErrorPanel } from '@/components/desk/reports/DeskErrorPanel';
import { rangeProblem } from '@/components/desk/reports/format';
import { useDeskStats } from '@/hooks/useDeskReports';
import { addIstDays, istToday } from '@/lib/desk/business-hours';
import { QUEUES, STATS_MAX_DAYS, type Queue } from '@/lib/desk/constants';

const INPUT_CLASS = 'rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-white';
const DEFAULT_RANGE_DAYS = 7;

export default function DeskDashboardPage() {
    const [today] = useState(() => istToday(new Date()));
    const [to, setTo] = useState(today);
    const [from, setFrom] = useState(() => addIstDays(today, -(DEFAULT_RANGE_DAYS - 1)));
    const [queue, setQueue] = useState<Queue | null>(null);
    const problem = rangeProblem(from, to, STATS_MAX_DAYS);
    const query = useDeskStats(from, to, queue, problem === null);
    const envelope = problem === null ? query.data : undefined;
    const failure = envelope && !envelope.ok ? envelope.error : null;
    const stats = envelope?.ok ? envelope.data : undefined;
    const isLoading = problem === null && query.isLoading;

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Desk dashboard</h1>
                    <p className="text-slate-400">Response times, complaints, refunds and sales. Days are IST days.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className={INPUT_CLASS} aria-label="From" />
                    <span className="text-slate-500">to</span>
                    <input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} className={INPUT_CLASS} aria-label="To" />
                    <select
                        value={queue ?? ''}
                        onChange={(event) => setQueue(QUEUES.find((item) => item === event.target.value) ?? null)}
                        className={INPUT_CLASS}
                        aria-label="Queue"
                    >
                        <option value="">All queues</option>
                        <option value="care">Care</option>
                        <option value="sales">Sales</option>
                    </select>
                    <button
                        type="button"
                        onClick={() => { void query.refetch(); }}
                        disabled={problem !== null || query.isFetching}
                        className="flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                </div>
            </div>

            {problem ? <p className="text-sm text-amber-300">{problem}</p> : null}
            {stats?.range.truncated ? (
                <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-300">
                    Too many tickets in this range to count them all. Choose fewer days.
                </p>
            ) : null}
            {stats && stats.range.stats_from === null ? (
                <p className="rounded-xl bg-slate-800/60 p-3 text-sm text-slate-300">Desk statistics start once go-live is set.</p>
            ) : null}

            {failure ? (
                <DeskErrorPanel code={failure.code} onRetry={() => { void query.refetch(); }} />
            ) : problem === null ? (
                <>
                    <NowTiles now={stats?.now} isLoading={isLoading} />
                    <VolumeSection volume={stats?.volume} isLoading={isLoading} />
                    <TimingSection stats={stats} isLoading={isLoading} />
                    <QualitySection quality={stats?.quality} isLoading={isLoading} />
                    <ComplaintsSection stats={stats} isLoading={isLoading} from={from} to={to} queue={queue} />
                    <MoneySection refunds={stats?.refunds} isLoading={isLoading} from={from} to={to} />
                    <SalesSection sales={stats?.sales} isLoading={isLoading} />
                    <RepeatComplainersTable rows={stats?.repeat_complainers} isLoading={isLoading} />
                </>
            ) : null}
        </div>
    );
}
