import { PulseSection } from '@/components/pulse/shared';
import type { ReviewView } from '@/lib/desk/review-report';
import { TicketList } from './ReviewTicketRow';

const LISTS: Array<{ key: keyof ReviewView['sales']; title: string; empty: string }> = [
    { key: 'opened', title: 'New', empty: 'No new sales ticket.' },
    { key: 'won', title: 'Won and paid', empty: 'Nothing won and paid in this window.' },
    { key: 'lost', title: 'Lost', empty: 'Nothing lost in this window.' },
    { key: 'awaiting_payment', title: 'Won, awaiting payment', empty: 'Nothing is waiting for payment.' },
];

export function SalesBlock({ sales }: { sales: ReviewView['sales'] }) {
    return (
        <PulseSection title="5. Sales" subtitle="New, won, lost and waiting for payment." isLoading={false} isEmpty={false} emptyText="">
            {LISTS.map((list) => (
                <div key={list.key}>
                    <h3 className="text-sm font-semibold text-slate-300">{list.title} ({sales[list.key].length})</h3>
                    <TicketList tickets={sales[list.key]} empty={list.empty} />
                </div>
            ))}
        </PulseSection>
    );
}
