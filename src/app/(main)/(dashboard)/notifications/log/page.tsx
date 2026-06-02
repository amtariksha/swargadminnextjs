'use client';

// Notification send log — per-recipient, per-channel audit of every notify()
// fan-out (backend: GET /api/notifications/send_log, table notification_send_log,
// migration 053). Answers "who was notified, on which channel, with which
// template" for any scenario + date range (e.g. a low-balance cron run).

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, RefreshCw } from 'lucide-react';
import { GET } from '@/lib/api';

type ChannelStatus = 'sent' | 'skipped' | 'failed' | 'unknown';

interface SendLogRow {
    id: number;
    user_id: number | null;
    user_name: string | null;
    user_phone: string | null;
    scenario: string | null;
    category: string | null;
    template_name: string | null;
    bell_status: ChannelStatus | null;
    whatsapp_status: ChannelStatus | null;
    push_status: ChannelStatus | null;
    email_status: ChannelStatus | null;
    detail: Record<string, unknown> | null;
    created_at: string | null;
}

interface SendLogResponse {
    rows: SendLogRow[];
    summary: Record<'bell' | 'whatsapp' | 'push' | 'email', Record<string, number>>;
    count: number;
    limit: number;
}

const CHANNELS = ['bell', 'whatsapp', 'push', 'email'] as const;
type Channel = (typeof CHANNELS)[number];

// Common scenarios for the dropdown; the field is still free-text so any
// scenario slug works.
const SCENARIO_PRESETS = [
    'low_wallet', 'order_placed', 'order_delivered', 'order_status_changed',
    'partial_delivery', 'wallet_updated', 'welcome_user', 'broadcast',
    'product_back_in_stock',
];

function statusClass(status: string | null | undefined): string {
    switch (status) {
        case 'sent': return 'bg-emerald-500/20 text-emerald-300';
        case 'failed': return 'bg-red-500/20 text-red-300';
        case 'skipped': return 'bg-slate-600/40 text-slate-300';
        default: return 'bg-slate-700/30 text-slate-500';
    }
}

function StatusBadge({ status }: { status: string | null }) {
    return (
        <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${statusClass(status)}`}>
            {status || '—'}
        </span>
    );
}

const today = () => new Date().toISOString().slice(0, 10);

export default function NotificationLogPage() {
    const [scenario, setScenario] = useState('low_wallet');
    const [startDate, setStartDate] = useState(today());
    const [endDate, setEndDate] = useState(today());
    const [channel, setChannel] = useState<Channel | ''>('');
    const [status, setStatus] = useState<ChannelStatus | ''>('');

    const params: Record<string, unknown> = {
        ...(scenario ? { scenario } : {}),
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate ? { end_date: endDate } : {}),
        ...(channel && status ? { channel, status } : {}),
        limit: 2000,
    };

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['notification-send-log', params],
        queryFn: async () => {
            const res = await GET<SendLogResponse>('/notifications/send_log', params);
            return res.data;
        },
    });

    const rows = data?.rows ?? [];
    const summary = data?.summary;
    const inputClass =
        'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">Notification log</h1>
                    <p className="text-slate-400 text-sm">
                        Per-recipient, per-channel record of every notification sent — who got it,
                        on which channel (bell / WhatsApp / push / email), and which template.
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

            {/* Filters */}
            <div className="glass rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Scenario</label>
                    <input
                        list="scenario-presets"
                        value={scenario}
                        onChange={(e) => setScenario(e.target.value)}
                        placeholder="All scenarios"
                        className={inputClass}
                    />
                    <datalist id="scenario-presets">
                        {SCENARIO_PRESETS.map((s) => <option key={s} value={s} />)}
                    </datalist>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">From</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${inputClass} sm:max-w-[13rem]`} />
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">To</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputClass} sm:max-w-[13rem]`} />
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Channel</label>
                    <select value={channel} onChange={(e) => setChannel(e.target.value as Channel | '')} className={inputClass}>
                        <option value="">Any channel</option>
                        {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Status (of channel)</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value as ChannelStatus | '')} className={inputClass}>
                        <option value="">Any status</option>
                        <option value="sent">sent</option>
                        <option value="skipped">skipped</option>
                        <option value="failed">failed</option>
                    </select>
                </div>
            </div>

            {/* Per-channel summary tiles */}
            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {CHANNELS.map((ch) => {
                        const counts = summary[ch] || {};
                        return (
                            <div key={ch} className="glass rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Bell className="w-4 h-4 text-purple-300" />
                                    <span className="text-sm font-semibold text-white capitalize">{ch}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <span className="text-emerald-400">{counts.sent || 0} sent</span>
                                    <span className="text-slate-400">{counts.skipped || 0} skipped</span>
                                    <span className="text-red-400">{counts.failed || 0} failed</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Rows */}
            <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900/60 text-slate-400 uppercase text-xs tracking-wide">
                            <tr>
                                <th className="px-3 py-2 text-left">Time (IST)</th>
                                <th className="px-3 py-2 text-left">Customer</th>
                                <th className="px-3 py-2 text-left">Scenario</th>
                                <th className="px-3 py-2 text-left">Template</th>
                                <th className="px-3 py-2 text-left">Bell</th>
                                <th className="px-3 py-2 text-left">WhatsApp</th>
                                <th className="px-3 py-2 text-left">Push</th>
                                <th className="px-3 py-2 text-left">Email</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isLoading ? (
                                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No notifications match these filters.</td></tr>
                            ) : (
                                rows.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-800/30" title={r.detail ? JSON.stringify(r.detail, null, 2) : ''}>
                                        <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{r.created_at?.slice(0, 19) ?? '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                            <div className="font-medium text-white">{r.user_name || `#${r.user_id ?? '—'}`}</div>
                                            <div className="text-xs text-slate-500">{r.user_phone || ''}{r.user_id ? ` · id ${r.user_id}` : ''}</div>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                                            <div>{r.scenario || '—'}</div>
                                            <div className="text-xs text-slate-500">{r.category || ''}</div>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{r.template_name || '—'}</td>
                                        <td className="px-3 py-2.5"><StatusBadge status={r.bell_status} /></td>
                                        <td className="px-3 py-2.5"><StatusBadge status={r.whatsapp_status} /></td>
                                        <td className="px-3 py-2.5"><StatusBadge status={r.push_status} /></td>
                                        <td className="px-3 py-2.5"><StatusBadge status={r.email_status} /></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 border-t border-slate-800/40 text-xs text-slate-500">
                    {rows.length} row{rows.length === 1 ? '' : 's'} shown
                    {data?.limit && rows.length >= data.limit ? ` (capped at ${data.limit} — narrow the date range)` : ''}
                    . Hover a row to see per-channel detail (skip reasons / errors).
                </div>
            </div>
        </div>
    );
}
