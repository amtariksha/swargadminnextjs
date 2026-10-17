import Link from 'next/link';
import { PulseSection } from '@/components/pulse/shared';
import { Tile } from '@/components/desk/dashboard/NowTiles';
import { formatIst } from '@/components/desk/reports/format';
import type { ReviewView } from '@/lib/desk/review-report';
import { TicketList } from './ReviewTicketRow';

export function HealthBlock({ health }: { health: ReviewView['health'] }) {
    return (
        <PulseSection title="7. Health" subtitle="Signs that the ticket engine or the team missed something." isLoading={false} isEmpty={false} emptyText="">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Tile label="Tickets created late" value={health.orphans_repaired} hint="Found by the engine more than 3 minutes after the message" />
                <Tile label="Replies held back" value={health.acks_suppressed.length} />
                <Tile label="Closed over an unseen message" value={health.resolved_over_unseen.length} />
                <Tile label="Unverified money actions" value={health.unverified_actions} />
            </div>
            <p className="flex items-center gap-2 text-sm text-slate-300">
                Last tick: {formatIst(health.last_tick_at)}
                {health.tick_stale ? <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">stale</span> : null}
            </p>
            <h3 className="text-sm font-semibold text-slate-300">Suppressed acknowledgements</h3>
            {health.acks_suppressed.length === 0 ? <p className="py-2 text-sm text-slate-500">None in this window.</p> : (
                <ul className="text-sm text-slate-200">
                    {health.acks_suppressed.map((ack) => (
                        <li key={`${ack.ticket_no}:${ack.at}`} className="flex flex-wrap gap-x-4 border-t border-slate-800/60 py-2 first:border-t-0">
                            <Link href={`/desk?ticket=${ack.ticket_no}`} className="text-purple-300 underline">#{ack.ticket_no}</Link>
                            <span>{ack.text}</span>
                            <span className="text-slate-400">{ack.mode === 'on' ? 'held back' : 'would have been held back'}, {formatIst(ack.at)}</span>
                        </li>
                    ))}
                </ul>
            )}
            <h3 className="text-sm font-semibold text-slate-300">Resolved over an unseen message</h3>
            <TicketList tickets={health.resolved_over_unseen} empty="None in this window." />
        </PulseSection>
    );
}
