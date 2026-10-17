import { PulseSection } from '@/components/pulse/shared';
import type { ReviewTicketItem } from '@/lib/desk/review-report';
import { TicketList } from './ReviewTicketRow';

export function SampleBlock({ tickets }: { tickets: ReviewTicketItem[] }) {
    return (
        <PulseSection
            title="6. Tickets to read"
            subtitle="A few tickets a person closed as explained or no action. The same ones show all day."
            isLoading={false}
            isEmpty={false}
            emptyText=""
        >
            <TicketList tickets={tickets} empty="No explained or no-action ticket was closed in this window." />
        </PulseSection>
    );
}
