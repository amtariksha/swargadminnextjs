'use client';

import {
    ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
    Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { usePulseRevenue } from '@/hooks/usePulse';
import { formatINR } from '@/lib/accounting';
import { PulseSection, num, monthLabel, inrCompact } from './shared';

interface RevenueSectionProps {
    months: number;
}

export function RevenueSection({ months }: RevenueSectionProps) {
    const { data, isLoading } = usePulseRevenue(months);
    const rows = (data?.months ?? []).map((m) => ({
        label: monthLabel(m.month),
        b2c: num(m.b2c_delivered_value) ?? 0,
        b2b: num(m.b2b_delivered_value) ?? 0,
        daytime: num(m.daytime_value) ?? 0,
        total: num(m.total_value) ?? 0,
        topups: num(m.wallet_topups) ?? 0,
        momPct: m.mom_pct,
    }));

    return (
        <PulseSection
            title="Revenue"
            subtitle="Value actually delivered each month (subscriptions B2C/B2B + day orders). Wallet top-ups shown for context — they are money in, not revenue."
            isLoading={isLoading}
            isEmpty={rows.length === 0}
            emptyText="No delivered orders yet — revenue appears here once deliveries are marked."
        >
            <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={rows}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={inrCompact} width={70} />
                        <Tooltip
                            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                            labelStyle={{ color: '#e2e8f0' }}
                            formatter={(value, name) => [formatINR(Number(value ?? 0)), String(name ?? '')]}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="b2c" name="B2C" stackId="rev" fill="#34d399" />
                        <Bar dataKey="b2b" name="B2B" stackId="rev" fill="#60a5fa" />
                        <Bar dataKey="daytime" name="Day orders" stackId="rev" fill="#fbbf24" />
                        <Line dataKey="topups" name="Wallet top-ups" type="monotone"
                            stroke="#a78bfa" strokeWidth={1.5} dot={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-slate-400">
                        <tr>
                            <th className="text-left p-2">Month</th>
                            <th className="text-right p-2">Total delivered value</th>
                            <th className="text-right p-2">vs previous month</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40">
                        {[...rows].reverse().map((r) => (
                            <tr key={r.label}>
                                <td className="p-2 text-slate-200">{r.label}</td>
                                <td className="p-2 text-right text-slate-300">{formatINR(r.total)}</td>
                                <td className={`p-2 text-right ${r.momPct == null ? 'text-slate-500'
                                    : r.momPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {r.momPct == null ? '—' : `${r.momPct > 0 ? '+' : ''}${r.momPct}%`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-slate-500">
                Old months (before per-delivery price sealing) use the order&apos;s current price, so
                editing an old order can shift them slightly. Refunds are not deducted here.
            </p>
        </PulseSection>
    );
}
