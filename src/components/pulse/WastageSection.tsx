'use client';

import { useState } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
    Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { usePulseWastage } from '@/hooks/usePulse';
import { PulseSection, num, dayLabel } from './shared';

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const daysAgo = (days: number) => {
    const d = new Date(Date.now() + 5.5 * 3600 * 1000);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
};

export function WastageSection() {
    const [windowDays, setWindowDays] = useState<30 | 90>(30);
    const { data, isLoading } = usePulseWastage(daysAgo(windowDays - 1), istToday());

    // Merge the two stages by day for one chart; NULL stays null ("not logged").
    const byDay = new Map<string, { label: string; productionPct: number | null; packingPct: number | null; notLogged: boolean }>();
    for (const row of data?.production ?? []) {
        const key = String(row.day).slice(0, 10);
        byDay.set(key, {
            label: dayLabel(row.day),
            productionPct: num(row.production_wastage_pct),
            packingPct: null,
            notLogged: false,
        });
    }
    for (const row of data?.packing ?? []) {
        const key = String(row.day).slice(0, 10);
        const entry = byDay.get(key) ?? { label: dayLabel(row.day), productionPct: null, packingPct: null, notLogged: false };
        entry.packingPct = num(row.packing_wastage_pct);
        entry.notLogged = row.packed_qty == null;
        byDay.set(key, entry);
    }
    const rows = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
    const notLoggedDays = rows.filter((r) => r.notLogged).length;

    return (
        <PulseSection
            title="Wastage"
            subtitle="Production stage (litres lost while making) and packing stage (packets lost while packing), as % per day. Grey days mean nothing was logged — not zero wastage."
            isLoading={isLoading}
            isEmpty={rows.length === 0}
            emptyText="No production or packing runs logged yet — wastage appears once the team records them."
            actions={
                <div className="flex gap-1">
                    {([30, 90] as const).map((d) => (
                        <button key={d} onClick={() => setWindowDays(d)}
                            className={`px-3 py-1.5 rounded-lg text-xs ${windowDays === d
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}>
                            {d} days
                        </button>
                    ))}
                </div>
            }
        >
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={12} width={40} unit="%" />
                        <Tooltip
                            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                            labelStyle={{ color: '#e2e8f0' }}
                            formatter={(value, name) => [value == null ? 'not logged' : `${value}%`, String(name ?? '')]}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="productionPct" name="Production wastage %" fill="#fb923c" />
                        <Bar dataKey="packingPct" name="Packing wastage %" fill="#f87171" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {notLoggedDays > 0 && (
                <p className="text-xs text-slate-500">
                    {notLoggedDays} day{notLoggedDays === 1 ? '' : 's'} in this window had no packing log —
                    those days show no packing bar rather than 0%.
                </p>
            )}
        </PulseSection>
    );
}
