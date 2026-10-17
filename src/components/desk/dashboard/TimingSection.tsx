import { PulseSection } from '@/components/pulse/shared';
import { formatDuration } from '@/components/desk/reports/format';
import type { DeskStats, StatsExec, StatsTiming } from '@/lib/desk/types';
import { CountTable, Tile } from './NowTiles';

type ExecRow = StatsExec & StatsTiming;
const nonZero = (counts: Record<string, number>): Array<[string, number]> =>
    Object.entries(counts).filter(([, count]) => count > 0);

function ExecTable({ title, rows }: { title: string; rows: ExecRow[] }) {
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="text-left text-slate-400">
                    <th className="py-1 font-medium">{title}</th>
                    <th className="py-1 text-right font-medium">Tickets</th>
                    <th className="py-1 text-right font-medium">Median</th>
                    <th className="py-1 text-right font-medium">90th percentile</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.actor_id ?? 'none'} className="border-t border-slate-800/60 text-slate-200">
                        <td className="py-1">{row.actor_id === null ? 'Unattributed' : (row.actor_name ?? `User ${row.actor_id}`)}</td>
                        <td className="py-1 text-right tabular-nums">{row.n}</td>
                        <td className="py-1 text-right tabular-nums">{formatDuration(row.median_secs)}</td>
                        <td className="py-1 text-right tabular-nums">{formatDuration(row.p90_secs)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function TimingSection({ stats, isLoading }: { stats: DeskStats | undefined; isLoading: boolean }) {
    return (
        <PulseSection
            title="Response and resolution"
            subtitle="Manual and back-filled tickets are left out of these times."
            isLoading={isLoading}
            isEmpty={false}
            emptyText=""
        >
            {stats ? (
                <>
                    <h3 className="text-sm font-semibold text-slate-300">First response</h3>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                        <Tile label="Median" value={formatDuration(stats.first_response.median_secs)} />
                        <Tile label="Median, business hours" value={formatDuration(stats.first_response.business_median_secs)} />
                        <Tile label="90th percentile" value={formatDuration(stats.first_response.p90_secs)} />
                        <Tile label="Tickets" value={stats.first_response.n} />
                        <Tile label="Unattributed" value={stats.first_response.unattributed} hint="Replies typed in the phone app" />
                    </div>
                    <ExecTable title="By executive" rows={stats.first_response.by_exec} />
                    <h3 className="pt-2 text-sm font-semibold text-slate-300">Resolution</h3>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <Tile label="Median" value={formatDuration(stats.resolution.median_secs)} hint="As the customer felt it" />
                        <Tile label="Median, net" value={formatDuration(stats.resolution.net_median_secs)} hint="Minus waiting and hold" />
                        <Tile label="90th percentile" value={formatDuration(stats.resolution.p90_secs)} />
                        <Tile label="Tickets" value={stats.resolution.n} />
                    </div>
                    <ExecTable title="By executive" rows={stats.resolution.by_exec} />
                    <div className="grid gap-6 md:grid-cols-2">
                        <CountTable title="Resolved how" rows={nonZero(stats.resolution.by_via)} />
                        <CountTable title="Resolution code" rows={nonZero(stats.resolution.by_code)} />
                    </div>
                </>
            ) : null}
        </PulseSection>
    );
}
