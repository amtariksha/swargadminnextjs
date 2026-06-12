'use client';

/**
 * Settings → Server Health — live process/system/DB-pool metrics + optional
 * pm2 log tail. Polls GET /admin/server-health every 5s ONLY while this page
 * is mounted (React Query stops refetching on unmount), so it costs the
 * server nothing when nobody is looking. Deploy metadata comes from the
 * existing public /_meta/version.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';
import { Activity, Cpu, MemoryStick, Database, FileText, GitBranch } from 'lucide-react';

interface PoolStat { pool: string; total: number; idle: number; waiting: number }

interface ServerHealth {
    time: string;
    uptime_seconds: number;
    process: { pid: number; node: string; rss_mb: number; heap_used_mb: number; heap_total_mb: number; external_mb: number };
    system: { loadavg_1m: number; loadavg_5m: number; loadavg_15m: number; cpus: number; total_mem_mb: number; free_mem_mb: number; os_uptime_seconds: number };
    db_pools: PoolStat[];
    logs?: { out: string[] | null; error: string[] | null };
}

interface VersionMeta { branch?: string; sha?: string; startedAt?: string; env?: string }

const fmtUptime = (s: number) => {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function ServerHealthPage() {
    const [showLogs, setShowLogs] = useState(false);

    const { data: health, isLoading, dataUpdatedAt } = useQuery({
        queryKey: ['server-health', showLogs],
        queryFn: async () => {
            const res = await GET<ServerHealth>(`/admin/server-health${showLogs ? '?logs=1' : ''}`);
            return res.data;
        },
        refetchInterval: 5000,   // only while this page is mounted
    });

    const { data: version } = useQuery({
        queryKey: ['server-version'],
        queryFn: async () => {
            const res = await GET<VersionMeta>('/_meta/version');
            return res.data;
        },
        refetchInterval: 60_000,
    });

    const memPct = health
        ? Math.round(((health.system.total_mem_mb - health.system.free_mem_mb) / health.system.total_mem_mb) * 100)
        : 0;
    const loadPct = health
        ? Math.min(100, Math.round((health.system.loadavg_1m / health.system.cpus) * 100))
        : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Activity className="w-8 h-8 text-emerald-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Server Health</h1>
                        <p className="text-slate-400">
                            Live metrics from node.desicowmilk.com — refreshed every 5s while this page is open
                            {dataUpdatedAt ? ` · last ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowLogs((v) => !v)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm border ${showLogs ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'bg-slate-800/50 border-slate-700/50 text-slate-300'}`}
                >
                    <FileText className="w-4 h-4" /> {showLogs ? 'Hide logs' : 'Show logs'}
                </button>
            </div>

            {isLoading && !health ? (
                <div className="glass rounded-xl p-8 text-center text-slate-400">Loading metrics…</div>
            ) : !health ? (
                <div className="glass rounded-xl p-8 text-center text-red-400">Could not load server health.</div>
            ) : (
                <>
                    {/* Headline cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="glass rounded-xl p-4">
                            <p className="text-sm text-slate-400 flex items-center gap-1.5"><Cpu className="w-4 h-4" /> Load (1m)</p>
                            <p className={`text-2xl font-bold ${loadPct > 80 ? 'text-red-400' : loadPct > 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {health.system.loadavg_1m}
                            </p>
                            <p className="text-xs text-slate-500">{loadPct}% of {health.system.cpus} cores · 5m {health.system.loadavg_5m} · 15m {health.system.loadavg_15m}</p>
                        </div>
                        <div className="glass rounded-xl p-4">
                            <p className="text-sm text-slate-400 flex items-center gap-1.5"><MemoryStick className="w-4 h-4" /> System Memory</p>
                            <p className={`text-2xl font-bold ${memPct > 90 ? 'text-red-400' : memPct > 75 ? 'text-amber-400' : 'text-white'}`}>{memPct}%</p>
                            <p className="text-xs text-slate-500">
                                {Math.round(health.system.total_mem_mb - health.system.free_mem_mb)} / {Math.round(health.system.total_mem_mb)} MB used
                            </p>
                        </div>
                        <div className="glass rounded-xl p-4">
                            <p className="text-sm text-slate-400">Node Process</p>
                            <p className="text-2xl font-bold text-blue-400">{health.process.rss_mb} MB</p>
                            <p className="text-xs text-slate-500">heap {health.process.heap_used_mb}/{health.process.heap_total_mb} MB · pid {health.process.pid} · {health.process.node}</p>
                        </div>
                        <div className="glass rounded-xl p-4">
                            <p className="text-sm text-slate-400">Uptime</p>
                            <p className="text-2xl font-bold text-white">{fmtUptime(health.uptime_seconds)}</p>
                            <p className="text-xs text-slate-500">server {fmtUptime(health.system.os_uptime_seconds)}</p>
                        </div>
                    </div>

                    {/* Deploy + DB pools */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="glass rounded-xl p-4">
                            <p className="text-sm text-slate-400 flex items-center gap-1.5 mb-3"><GitBranch className="w-4 h-4" /> Deployment</p>
                            {version ? (
                                <div className="space-y-1 text-sm">
                                    <p className="text-white font-mono">{version.sha?.slice(0, 10)} <span className="text-slate-500">on</span> {version.branch}</p>
                                    <p className="text-slate-400">started {version.startedAt ? new Date(version.startedAt).toLocaleString() : '—'} · {version.env}</p>
                                </div>
                            ) : <p className="text-slate-500 text-sm">—</p>}
                        </div>
                        <div className="glass rounded-xl p-4">
                            <p className="text-sm text-slate-400 flex items-center gap-1.5 mb-3"><Database className="w-4 h-4" /> DB Connection Pools</p>
                            {health.db_pools.length === 0 ? (
                                <p className="text-slate-500 text-sm">No active pools</p>
                            ) : (
                                <div className="space-y-2">
                                    {health.db_pools.map((p) => (
                                        <div key={p.pool} className="flex items-center justify-between text-sm">
                                            <span className="text-slate-300 font-mono text-xs">{p.pool}</span>
                                            <span className="text-slate-400">
                                                <span className="text-white">{p.total}</span> conn ·{' '}
                                                <span className="text-emerald-400">{p.idle}</span> idle ·{' '}
                                                <span className={p.waiting > 0 ? 'text-red-400' : 'text-slate-500'}>{p.waiting}</span> waiting
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Log tail */}
                    {showLogs && health.logs && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {(['out', 'error'] as const).map((kind) => (
                                <div key={kind} className="glass rounded-xl p-4">
                                    <p className="text-sm text-slate-400 mb-2">pm2 {kind} log (last {health.logs?.[kind]?.length ?? 0} lines)</p>
                                    <pre className={`text-[11px] leading-relaxed overflow-auto max-h-80 whitespace-pre-wrap ${kind === 'error' ? 'text-red-300/80' : 'text-slate-300/80'}`}>
                                        {health.logs?.[kind]?.length ? health.logs[kind]!.join('\n') : 'unavailable'}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
