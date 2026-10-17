import type { ReactNode } from 'react';
import { PulseSection } from '@/components/pulse/shared';
import { formatDuration, humanise } from '@/components/desk/reports/format';
import type { DeskStats } from '@/lib/desk/types';

/** One number with a label. Shared by every dashboard section. */
export function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
    return (
        <div className="glass rounded-xl p-4">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{value}</p>
            {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
    );
}

/** A two-column table of a name and a count; shared by the dashboard sections. */
export function CountTable({ title, rows }: { title: string; rows: Array<[string | null, number]> }) {
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="text-left text-slate-400">
                    <th className="py-1 font-medium">{title}</th>
                    <th className="py-1 text-right font-medium">Tickets</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(([name, count]) => (
                    <tr key={name ?? 'none'} className="border-t border-slate-800/60 text-slate-200">
                        <td className="py-1">{humanise(name)}</td>
                        <td className="py-1 text-right tabular-nums">{count}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function NowTiles({ now, isLoading }: { now: DeskStats['now'] | undefined; isLoading: boolean }) {
    return (
        <PulseSection
            title="Right now"
            subtitle="Open tickets at this moment; the dates above do not change these."
            isLoading={isLoading}
            isEmpty={false}
            emptyText=""
        >
            {now ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Tile label="Awaiting reply" value={now.awaiting} />
                    <Tile label="Oldest wait" value={formatDuration(now.oldest_wait_secs)} />
                    <Tile label="Waiting past the alert limit" value={now.over_alert} />
                    <Tile label="Open more than 24 h" value={now.open_over_24h} />
                    <Tile label="On hold" value={now.on_hold} hint={`Oldest hold: ${formatDuration(now.oldest_hold_secs)}`} />
                    <Tile label="Unassigned" value={now.unassigned} />
                    <Tile label="Needs wrap-up" value={now.wrap_up_backlog} />
                </div>
            ) : null}
        </PulseSection>
    );
}
