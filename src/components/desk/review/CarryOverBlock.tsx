import { PulseSection } from '@/components/pulse/shared';
import { formatIstDay } from '@/components/desk/reports/format';
import type { ReviewView } from '@/lib/desk/review-report';
import { TicketList } from './ReviewTicketRow';

export function CarryOverBlock({ data }: { data: ReviewView['carry_over'] }) {
    return (
        <PulseSection title="1. Carry-over" subtitle="Still open now, whatever the date chosen." isLoading={false} isEmpty={false} emptyText="">
            <h3 className="text-sm font-semibold text-slate-300">Open more than 24 hours ({data.open_over_24h.length})</h3>
            <TicketList tickets={data.open_over_24h} empty="Nothing has been open that long." />
            <h3 className="pt-2 text-sm font-semibold text-slate-300">On hold ({data.on_hold.length})</h3>
            <TicketList tickets={data.on_hold} empty="Nothing is on hold." />
            <h3 className="pt-2 text-sm font-semibold text-slate-300">Action items due ({data.action_items_due.length})</h3>
            {data.action_items_due.length === 0 ? (
                <p className="py-2 text-sm text-slate-500">No action item is due.</p>
            ) : (
                <ul className="text-sm text-slate-200">
                    {data.action_items_due.map((item) => (
                        <li key={item.id} className="border-t border-slate-800/60 py-2 first:border-t-0">
                            {item.title}
                            <span className="ml-3 text-slate-400">
                                due {item.due_date ? formatIstDay(item.due_date) : 'no date'}{item.owner_name ? `, ${item.owner_name}` : ''}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </PulseSection>
    );
}
