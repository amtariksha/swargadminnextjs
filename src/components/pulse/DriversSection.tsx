'use client';

import { useState } from 'react';
import MonthRangePicker, { currentMonthRange } from '@/components/MonthRangePicker';
import { usePulseDrivers } from '@/hooks/usePulse';
import { PulseSection } from './shared';

export function DriversSection() {
    const [range, setRange] = useState(currentMonthRange());
    const { data, isLoading } = usePulseDrivers(range.from, range.to);
    const drivers = data?.drivers ?? [];

    return (
        <PulseSection
            title="Driver utilization"
            subtitle="Stops handled, delivery success rate, and the active delivery window per driver for the selected period."
            isLoading={isLoading}
            isEmpty={drivers.length === 0}
            emptyText="No deliveries in this period — pick a month where the delivery lists ran."
            actions={
                <MonthRangePicker from={range.from} to={range.to}
                    onChange={(from, to) => setRange({ from, to })} />
            }
        >
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-800/50 text-slate-400">
                        <tr>
                            <th className="text-left p-3">Driver</th>
                            <th className="text-right p-3">Days</th>
                            <th className="text-right p-3">Stops</th>
                            <th className="text-right p-3">Stops/day</th>
                            <th className="text-right p-3">Delivered</th>
                            <th className="text-right p-3">Not delivered</th>
                            <th className="text-right p-3">Success</th>
                            <th className="text-right p-3">Qty</th>
                            <th className="text-right p-3">Avg window</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40">
                        {drivers.map((d) => (
                            <tr key={d.driver_id} className="hover:bg-slate-800/30">
                                <td className="p-3 text-slate-200">{d.driver_name}</td>
                                <td className="p-3 text-right text-slate-300">{d.days_worked}</td>
                                <td className="p-3 text-right text-slate-300">{d.total_stops}</td>
                                <td className="p-3 text-right text-slate-300">{d.avg_stops_per_day}</td>
                                <td className="p-3 text-right text-emerald-400">{d.delivered_stops}</td>
                                <td className="p-3 text-right text-rose-400">{d.not_delivered_stops}</td>
                                <td className={`p-3 text-right ${d.delivered_rate_pct == null ? 'text-slate-500'
                                    : d.delivered_rate_pct >= 95 ? 'text-emerald-400'
                                        : d.delivered_rate_pct >= 85 ? 'text-amber-400' : 'text-rose-400'}`}>
                                    {d.delivered_rate_pct == null ? '—' : `${d.delivered_rate_pct}%`}
                                </td>
                                <td className="p-3 text-right text-slate-300">{d.total_qty}</td>
                                <td className="p-3 text-right text-slate-300">
                                    {d.avg_window_minutes == null ? '—'
                                        : `${Math.floor(d.avg_window_minutes / 60)}h ${d.avg_window_minutes % 60}m`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </PulseSection>
    );
}
