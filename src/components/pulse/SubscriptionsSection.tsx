'use client';

import {
    ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
    Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { usePulseSubscriptions } from '@/hooks/usePulse';
import { PulseSection, num, monthLabel } from './shared';

interface SubscriptionsSectionProps {
    months: number;
}

export function SubscriptionsSection({ months }: SubscriptionsSectionProps) {
    const { data, isLoading } = usePulseSubscriptions(months);
    const rows = (data?.months ?? []).map((m) => ({
        label: monthLabel(m.month),
        active: num(m.active_subs) ?? 0,
        newSubs: num(m.new_subs) ?? 0,
        churned: num(m.churned_subs) ?? 0,
        churnPct: m.churn_pct,
        inProgress: m.month_in_progress,
    }));

    return (
        <PulseSection
            title="Subscriptions"
            subtitle="Active = subscriptions that delivered at least once in the month. New = first-ever delivery. Churned = last-ever delivery (a paused subscription that resumes later was never churned)."
            isLoading={isLoading}
            isEmpty={rows.length === 0}
            emptyText="No subscription deliveries yet — growth and churn appear here once the daily lists run."
        >
            <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={rows}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                        <YAxis stroke="#94a3b8" fontSize={12} width={50} />
                        <Tooltip
                            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                            labelStyle={{ color: '#e2e8f0' }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="newSubs" name="New" fill="#34d399" />
                        <Bar dataKey="churned" name="Churned" fill="#f87171" />
                        <Line dataKey="active" name="Active" type="monotone"
                            stroke="#60a5fa" strokeWidth={2} dot={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-slate-400">
                        <tr>
                            <th className="text-left p-2">Month</th>
                            <th className="text-right p-2">Active</th>
                            <th className="text-right p-2">New</th>
                            <th className="text-right p-2">Churned</th>
                            <th className="text-right p-2">Churn rate</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40">
                        {[...rows].reverse().map((r) => (
                            <tr key={r.label}>
                                <td className="p-2 text-slate-200">
                                    {r.label}
                                    {r.inProgress && (
                                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">
                                            in progress
                                        </span>
                                    )}
                                </td>
                                <td className="p-2 text-right text-slate-300">{r.active}</td>
                                <td className="p-2 text-right text-emerald-400">{r.newSubs}</td>
                                <td className="p-2 text-right text-rose-400">{r.inProgress ? '—' : r.churned}</td>
                                <td className="p-2 text-right text-slate-300">
                                    {r.inProgress || r.churnPct == null ? '—' : `${r.churnPct}%`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </PulseSection>
    );
}
