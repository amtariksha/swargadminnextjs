import { PulseSection } from '@/components/pulse/shared';
import { formatINR } from '@/lib/accounting';
import type { ReviewView } from '@/lib/desk/review-report';
import { TicketList } from './ReviewTicketRow';

export function ComplaintsBlock({ groups }: { groups: ReviewView['complaints'] }) {
    return (
        <PulseSection
            title="2. Complaints by category"
            subtitle="Opened in the window. Open a category to see its tickets."
            isLoading={false}
            isEmpty={groups.length === 0}
            emptyText="No complaints in this window."
        >
            <div className="space-y-2">
                {groups.map((group) => (
                    <details key={group.category_slug} className="rounded-xl bg-slate-900/40 p-3">
                        <summary className="flex cursor-pointer flex-wrap items-center gap-x-6 gap-y-1 text-sm text-white">
                            <span className="font-medium">{group.label}</span>
                            <span>{group.n} complaints</span>
                            <span className="text-slate-400">{group.per_1000 === null ? 'rate unavailable' : `${group.per_1000} per 1,000 deliveries`}</span>
                            <span className="text-slate-400">refunds {formatINR(group.refund_total)}</span>
                        </summary>
                        <div className="mt-2">
                            <TicketList tickets={group.tickets} empty="No tickets." />
                        </div>
                    </details>
                ))}
            </div>
        </PulseSection>
    );
}
