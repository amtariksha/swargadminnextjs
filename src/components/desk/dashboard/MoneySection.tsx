'use client';

import { PulseSection } from '@/components/pulse/shared';
import { humanise } from '@/components/desk/reports/format';
import { useRefundReport } from '@/hooks/useData';
import { formatINR } from '@/lib/accounting';
import type { DeskStats, IstDate } from '@/lib/desk/types';
import { Tile } from './NowTiles';

interface Props { refunds: DeskStats['refunds'] | undefined; isLoading: boolean; from: IstDate; to: IstDate }

export function MoneySection({ refunds, isLoading, from, to }: Props) {
    const backend = useRefundReport(from, to);
    const backendTotal = backend.isError || backend.data === undefined ? '—' : formatINR(backend.data.summary.total_amount);
    return (
        <PulseSection
            title="Refunds and credits through Desk"
            subtitle="Money recorded from a ticket. The backend total beside it covers every refund, whoever made it."
            isLoading={isLoading}
            isEmpty={false}
            emptyText=""
        >
            {refunds ? (
                <>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <Tile label="Issued through Desk" value={refunds.n} hint="refunds and wallet credits" />
                        <Tile label="Total" value={formatINR(refunds.total)} />
                        <Tile label="Not verified" value={refunds.unverified_n} />
                        <Tile label="Backend refunds report, same dates" value={backendTotal} />
                    </div>
                    <div className="grid gap-6 md:grid-cols-2">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-400"><th className="py-1 font-medium">By category</th><th className="py-1 text-right font-medium">Count</th><th className="py-1 text-right font-medium">Total</th></tr>
                            </thead>
                            <tbody>
                                {refunds.by_category.map((row) => (
                                    <tr key={row.category_slug ?? 'none'} className="border-t border-slate-800/60 text-slate-200">
                                        <td className="py-1">{humanise(row.category_slug)}</td>
                                        <td className="py-1 text-right tabular-nums">{row.n}</td>
                                        <td className="py-1 text-right tabular-nums">{formatINR(row.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-400"><th className="py-1 font-medium">By executive</th><th className="py-1 text-right font-medium">Count</th><th className="py-1 text-right font-medium">Total</th></tr>
                            </thead>
                            <tbody>
                                {refunds.by_exec.map((row) => (
                                    <tr key={row.actor_id ?? 'none'} className="border-t border-slate-800/60 text-slate-200">
                                        <td className="py-1">{row.actor_id === null ? 'Unattributed' : (row.actor_name ?? `User ${row.actor_id}`)}</td>
                                        <td className="py-1 text-right tabular-nums">{row.n}</td>
                                        <td className="py-1 text-right tabular-nums">{formatINR(row.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : null}
        </PulseSection>
    );
}
