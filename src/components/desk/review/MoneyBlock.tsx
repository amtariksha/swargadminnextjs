import Link from 'next/link';
import { PulseSection } from '@/components/pulse/shared';
import { formatIst, humanise } from '@/components/desk/reports/format';
import { formatINR } from '@/lib/accounting';
import type { ReviewView } from '@/lib/desk/review-report';
import { CreateActionItemButton } from './ReviewEditor';

export function MoneyBlock({ rows }: { rows: ReviewView['money'] }) {
    return (
        <PulseSection
            title="4. Refunds and credits"
            subtitle="Money recorded from a ticket in the window."
            isLoading={false}
            isEmpty={rows.length === 0}
            emptyText="No refund or credit in this window."
        >
            <ul className="text-sm text-slate-200">
                {rows.map((row) => (
                    <li key={row.action.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800/60 py-2 first:border-t-0">
                        <Link href={`/desk?ticket=${row.ticket_no}`} className="font-medium text-purple-300 underline">#{row.ticket_no}</Link>
                        <span>{humanise(row.action.action_type)}</span>
                        <span className="tabular-nums">{formatINR(row.action.amount)}</span>
                        <span className="text-slate-400">{row.customer_name ?? 'Not recorded'}</span>
                        <span className="text-slate-400">{humanise(row.category_slug)}</span>
                        <span className="text-slate-400">{row.action.actor_name ?? `User ${row.action.actor_id}`}</span>
                        <span className="text-slate-400">{formatIst(row.action.created_at)}</span>
                        {row.action.verified ? null : (
                            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">unverified</span>
                        )}
                        <CreateActionItemButton />
                    </li>
                ))}
            </ul>
        </PulseSection>
    );
}
