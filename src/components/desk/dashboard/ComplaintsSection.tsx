'use client';

import { useState } from 'react';
import { PulseSection } from '@/components/pulse/shared';
import { humanise } from '@/components/desk/reports/format';
import type { Queue } from '@/lib/desk/constants';
import type { DeskStats, IstDate, StatsDim } from '@/lib/desk/types';
import { CategoryDrilldownModal } from './CategoryDrilldownModal';
import { Tile } from './NowTiles';

type DimKey = 'by_category' | 'by_group' | 'by_driver' | 'by_drop_point' | 'by_pincode' | 'by_product' | 'by_root_cause';
const TABS: Array<{ key: DimKey; label: string }> = [
    { key: 'by_category', label: 'Category' },
    { key: 'by_group', label: 'Group' },
    { key: 'by_driver', label: 'Driver' },
    { key: 'by_drop_point', label: 'Drop point' },
    { key: 'by_pincode', label: 'Pincode' },
    { key: 'by_product', label: 'Product' },
    { key: 'by_root_cause', label: 'Root cause' },
];
const inr = (value: number): string => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function DimTable({ rows, rateHeading, onPick }: { rows: StatsDim[]; rateHeading: string; onPick?: (row: StatsDim) => void }) {
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="text-left text-slate-400">
                    <th className="py-1 font-medium">Name</th>
                    <th className="py-1 text-right font-medium">Complaints</th>
                    <th className="py-1 text-right font-medium">Refunds</th>
                    <th className="py-1 text-right font-medium">{rateHeading}</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => {
                    const clickable = onPick !== undefined && row.key !== null;
                    return (
                        <tr
                            key={row.key ?? 'none'}
                            onClick={clickable ? () => onPick(row) : undefined}
                            className={`border-t border-slate-800/60 text-slate-200 ${clickable ? 'cursor-pointer hover:bg-slate-800/40' : ''}`}
                        >
                            <td className="py-1">{row.label ?? humanise(row.key)}</td>
                            <td className="py-1 text-right tabular-nums">{row.n}</td>
                            <td className="py-1 text-right tabular-nums">{inr(row.refund_total)}</td>
                            <td className="py-1 text-right tabular-nums">{row.per_1000 ?? '—'}</td>
                        </tr>
                    );
                })}
                {rows.length === 0 ? <tr><td colSpan={4} className="py-3 text-center text-slate-500">No complaints in this range</td></tr> : null}
            </tbody>
        </table>
    );
}

interface Props { stats: DeskStats | undefined; isLoading: boolean; from: IstDate; to: IstDate; queue: Queue | null }

export function ComplaintsSection({ stats, isLoading, from, to, queue }: Props) {
    const [tab, setTab] = useState<DimKey>('by_category');
    const [picked, setPicked] = useState<StatsDim | null>(null);
    const complaints = stats?.complaints;
    return (
        <PulseSection title="Complaints" subtitle="Complaints opened in the range, manual tickets included." isLoading={isLoading} isEmpty={false} emptyText="">
            {complaints ? (
                <>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                        <Tile label="Complaints" value={complaints.total} />
                        <Tile label="Deliveries" value={complaints.deliveries ?? '—'} />
                        <Tile label="Per 1,000 deliveries" value={complaints.per_1000_deliveries ?? '—'} />
                    </div>
                    {complaints.deliveries === null ? (
                        <p className="text-sm text-amber-300">Rate per 1,000 deliveries unavailable — delivery counts could not be read.</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                        {TABS.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setTab(item.key)}
                                className={`rounded-lg px-3 py-1.5 text-xs ${tab === item.key ? 'bg-purple-500/20 text-purple-200' : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <DimTable
                        rows={complaints[tab]}
                        rateHeading={tab === 'by_product' ? 'per 1,000 units' : 'per 1,000 deliveries'}
                        onPick={tab === 'by_category' ? setPicked : undefined}
                    />
                    {picked?.key ? (
                        <CategoryDrilldownModal
                            from={from} to={to} queue={queue} slug={picked.key}
                            label={picked.label ?? humanise(picked.key)} onClose={() => setPicked(null)}
                        />
                    ) : null}
                </>
            ) : null}
        </PulseSection>
    );
}
