'use client';

// Automation run history view. Reads from automation_run table via
// GET /api/automation/runs. The table is populated server-side by the
// scheduler whenever a timed cron fires (see automationRunRecorder).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import {
    useAutomationRuns,
    useAutomationRunsSummary,
    type AutomationRun,
    type AutomationRunSummary,
} from '@/hooks/useData';

interface JobMeta {
    name: string;          // matches automation_run.job_name + cron job.name
    label: string;         // display in dropdown + table
    badgeClass: string;    // tailwind classes for the job badge
}

const JOBS: JobMeta[] = [
    { name: 'generate-delivery-list', label: 'Generate Delivery List', badgeClass: 'bg-purple-500/20 text-purple-300' },
    { name: 'low-balance-reminder',   label: 'Low Balance Reminder',   badgeClass: 'bg-amber-500/20 text-amber-300' },
    { name: 'sales-incentive',        label: 'Daytime Sales Incentive', badgeClass: 'bg-cyan-500/20 text-cyan-300' },
    { name: 'daily-db-backup',        label: 'Daily DB Backup',        badgeClass: 'bg-emerald-500/20 text-emerald-300' },
    { name: 'driver-nudge-download_5', label: 'Driver Nudge 05:00', badgeClass: 'bg-orange-500/20 text-orange-300' },
    { name: 'driver-nudge-download_6', label: 'Driver Nudge 06:00', badgeClass: 'bg-orange-500/20 text-orange-300' },
    { name: 'driver-nudge-sync_7',     label: 'Driver Nudge 07:00', badgeClass: 'bg-rose-500/20 text-rose-300' },
    { name: 'driver-nudge-sync_730',   label: 'Driver Nudge 07:30', badgeClass: 'bg-rose-500/20 text-rose-300' },
    { name: 'driver-nudge-sync_8',     label: 'Driver Nudge 08:00', badgeClass: 'bg-rose-500/20 text-rose-300' },
];

/** Format a duration in ms into "Xs" or "Xm Ys" — for at-a-glance reading. */
function formatDuration(ms: number | null | undefined): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rem = Math.round(s - m * 60);
    return `${m}m ${rem}s`;
}

/** Render the job's structured summary into a human-readable line. */
function renderSummary(run: AutomationRun): string {
    if (run.status === 'failed') {
        return run.error ? `error: ${run.error.slice(0, 120)}` : 'failed (no error message)';
    }
    const s = run.summary as Record<string, unknown> | null;
    if (!s || typeof s !== 'object') return '—';

    // Driver nudges (5 slots share this shape): { level, drivers, sent, cleared }.
    if (run.job_name.startsWith('driver-nudge-')) {
        return `drivers ${s.drivers ?? 0} · sent ${s.sent ?? 0} · cleared ${s.cleared ?? 0}`;
    }

    switch (run.job_name) {
        case 'low-balance-reminder':
            return `swept ${s.swept} · notified ${s.notified}` +
                   (s.cooledDown != null ? ` · cooled-down ${s.cooledDown}` : '') +
                   (s.days != null ? ` · ${s.days}d window` : '');
        case 'generate-delivery-list':
            return `inserted ${s.inserted ?? 0} · skipped-existing ${s.skipped_existing ?? 0}` +
                   ` · partial ${(s.partials as unknown[])?.length ?? 0}` +
                   ` · skipped ${(s.skips as unknown[])?.length ?? 0}` +
                   ` · unassigned ${(s.unassigned as unknown[])?.length ?? 0}`;
        case 'sales-incentive':
            if (s.skipped) return `skipped (${s.skipped})`;
            return `wrote ${s.rows ?? 0} incentive rows for ${s.date ?? ''}`;
        case 'daily-db-backup':
            if (s.skipped) return `skipped (${s.skipped})`;
            const sz = typeof s.size_bytes === 'number' ? `${(s.size_bytes / 1024 / 1024).toFixed(1)} MB` : '—';
            const monthly = s.monthly_key ? ' · monthly archived' : '';
            const retention = (s.retention_kept != null && s.retention_deleted != null)
                ? ` · kept ${s.retention_kept} · deleted ${s.retention_deleted}` : '';
            return `${sz}${monthly}${retention}`;
        case 'dispatch-broadcasts':
            return `dispatched ${s.dispatched ?? 0}`;
        default:
            return JSON.stringify(s).slice(0, 120);
    }
}

// IST renderer for this page's timestamps.
//
// automation_run.started_at / finished_at (and the summary's last_run_at, which
// is MAX(started_at)) are TIMESTAMP *without* time zone columns, written from
// Date.toISOString() with the Postgres session in UTC. The pg pool returns oid
// 1114 as the raw naive string, so the value reaching us is a UTC wall-clock
// like "2026-05-29 18:30:00". The shared formatApiDate() parses naive strings
// as browser-local, which renders that UTC wall-clock as-is — 5h30m behind real
// IST (midnight IST shows as the previous day 18:30).
//
// Fix here: parse the naive value as UTC, then render in Asia/Kolkata via Intl
// (deterministic regardless of the viewer's own browser timezone). Scoped to
// this page only — dateUtils and other pages are intentionally left untouched.
const istTimeFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});

function fmtTs(value: string | null | undefined): string {
    if (!value) return '—';
    const s = String(value).trim();
    // Naive "YYYY-MM-DD HH:mm:ss" with no zone marker → the stored value is a
    // UTC wall-clock, so anchor it to UTC. Anything carrying a T+Z/offset is
    // already an unambiguous instant — let the native parser handle it.
    const naive = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
    const instant = naive && !hasZone
        ? new Date(Date.UTC(+naive[1], +naive[2] - 1, +naive[3], +naive[4], +naive[5], +naive[6]))
        : new Date(s);
    if (Number.isNaN(instant.getTime())) return s.slice(0, 19);
    const parts = Object.fromEntries(
        istTimeFormat.formatToParts(instant).map((p) => [p.type, p.value]),
    );
    return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}:${parts.second}`;
}

export default function AutomationRunsPage() {
    const router = useRouter();
    const [jobFilter, setJobFilter] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('');

    const filters = {
        job: jobFilter || undefined,
        status: statusFilter || undefined,
        limit: 200,
    };
    const { data: runs = [], isLoading, refetch, isFetching } = useAutomationRuns(filters);
    const { data: summary = [] } = useAutomationRunsSummary();

    const jobMetaByName = (n: string): JobMeta | undefined =>
        JOBS.find((j) => j.name === n);

    const inputClass =
        'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => router.push('/settings/automation')}
                    className="p-2 hover:bg-slate-800/50 rounded-lg"
                    aria-label="Back to automation settings"
                >
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">Automation runs</h1>
                    <p className="text-slate-400 text-sm">
                        Every fire of a scheduled cron job — when it started, how long it took, and what it produced.
                        History begins from when this feature was deployed.
                    </p>
                </div>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Summary tiles — last 30 days per job */}
            {summary.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {summary.map((s: AutomationRunSummary) => {
                        const meta = jobMetaByName(s.job_name);
                        const okRate = s.total_runs > 0 ? Math.round((s.ok_runs / s.total_runs) * 100) : 0;
                        return (
                            <div key={s.job_name} className="glass rounded-xl p-4">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide ${meta?.badgeClass || 'bg-slate-700/40 text-slate-300'}`}>
                                        {meta?.label || s.job_name}
                                    </span>
                                </div>
                                <div className="text-2xl font-bold text-white">
                                    {s.total_runs}
                                    <span className="text-sm font-normal text-slate-500 ml-1">runs / 30d</span>
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    {s.failed_runs > 0
                                        ? <span className="text-red-400">{s.failed_runs} failed</span>
                                        : <span className="text-emerald-400">{okRate}% ok</span>}
                                    {' · '}
                                    avg {formatDuration(s.avg_duration_ms)}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1">
                                    last run {fmtTs(s.last_run_at)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Filters */}
            <div className="glass rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Job</label>
                    <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className={inputClass}>
                        <option value="">All jobs</option>
                        {JOBS.map((j) => (
                            <option key={j.name} value={j.name}>{j.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Status</label>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
                        <option value="">All statuses</option>
                        <option value="ok">Successful only</option>
                        <option value="failed">Failed only</option>
                    </select>
                </div>
            </div>

            {/* Run table */}
            <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900/60 text-slate-400 uppercase text-xs tracking-wide">
                            <tr>
                                <th className="px-3 py-2 text-left">Job</th>
                                <th className="px-3 py-2 text-left">Started</th>
                                <th className="px-3 py-2 text-left">Duration</th>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-left">Summary</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isLoading ? (
                                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
                            ) : runs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                                        No automation runs recorded yet.
                                        {' '}
                                        Runs are recorded going forward — the table will populate after the next 20:00 IST cron fire.
                                    </td>
                                </tr>
                            ) : (
                                runs.map((r) => {
                                    const meta = jobMetaByName(r.job_name);
                                    return (
                                        <tr key={r.id} className="hover:bg-slate-800/30">
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${meta?.badgeClass || 'bg-slate-700/40 text-slate-300'}`}>
                                                    {meta?.label || r.job_name}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                                {fmtTs(r.started_at)}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                                {formatDuration(r.duration_ms)}
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                {r.status === 'ok' ? (
                                                    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> ok
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-red-400 text-xs">
                                                        <XCircle className="w-3.5 h-3.5" /> failed
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-300" title={r.error || JSON.stringify(r.summary, null, 2)}>
                                                {renderSummary(r)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 border-t border-slate-800/40 text-xs text-slate-500">
                    {runs.length} run{runs.length === 1 ? '' : 's'} shown (most recent first, max 200)
                </div>
            </div>
        </div>
    );
}
