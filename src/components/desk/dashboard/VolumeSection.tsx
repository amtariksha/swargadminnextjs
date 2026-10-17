import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PulseSection, dayLabel } from '@/components/pulse/shared';
import type { DeskStats } from '@/lib/desk/types';
import { CountTable, Tile } from './NowTiles';

const entries = (counts: Record<string, number>): Array<[string, number]> => Object.entries(counts);

export function VolumeSection({ volume, isLoading }: { volume: DeskStats['volume'] | undefined; isLoading: boolean }) {
    const days = (volume?.by_day ?? []).map((day) => ({ ...day, label: dayLabel(day.date) }));
    return (
        <PulseSection
            title="Volume"
            subtitle="Tickets opened in the range. A ticket resolved later counts under the day it was opened."
            isLoading={isLoading}
            isEmpty={false}
            emptyText=""
        >
            {volume ? (
                <>
                    <div className="grid grid-cols-3 gap-4">
                        <Tile label="Opened" value={volume.opened} />
                        <Tile label="Resolved" value={volume.resolved} />
                        <Tile label="Not classified" value={volume.unclassified} />
                    </div>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={days}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                                <YAxis stroke="#94a3b8" fontSize={12} width={40} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                                    labelStyle={{ color: '#e2e8f0' }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="opened" name="Opened" fill="#38bdf8" />
                                <Bar dataKey="resolved" name="Resolved" fill="#34d399" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid gap-6 md:grid-cols-3">
                        <CountTable title="Type" rows={entries(volume.by_type)} />
                        <CountTable title="Queue" rows={entries(volume.by_queue)} />
                        <CountTable title="Report group" rows={entries(volume.by_report_group)} />
                    </div>
                </>
            ) : null}
        </PulseSection>
    );
}
