import Link from 'next/link';
import { PulseSection } from '@/components/pulse/shared';
import { formatIstDay, humanise } from '@/components/desk/reports/format';
import type { ReviewCluster } from '@/lib/desk/types';
import type { ReviewView } from '@/lib/desk/review-report';
import { CreateActionItemButton } from './ReviewEditor';

export function TicketLinks({ ticketNos }: { ticketNos: number[] }) {
    return (
        <span className="flex flex-wrap gap-2">
            {ticketNos.map((ticketNo) => (
                <Link key={ticketNo} href={`/desk?ticket=${ticketNo}`} className="text-purple-300 underline">#{ticketNo}</Link>
            ))}
        </span>
    );
}

function ClusterList<T extends ReviewCluster>({ title, rows, extra }: { title: string; rows: T[]; extra?: (row: T) => string }) {
    return (
        <div>
            <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
            {rows.length === 0 ? <p className="py-2 text-sm text-slate-500">Nothing repeats.</p> : (
                <ul className="text-sm text-slate-200">
                    {rows.map((row) => (
                        <li key={`${row.key ?? 'none'}${extra?.(row) ?? ''}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800/60 py-2 first:border-t-0">
                            <span className="font-medium">{row.label ?? humanise(row.key)}</span>
                            {extra ? <span className="text-slate-400">{extra(row)}</span> : null}
                            <span>{row.n} tickets</span>
                            <TicketLinks ticketNos={row.ticket_nos} />
                            <CreateActionItemButton />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function ClustersBlock({ clusters }: { clusters: ReviewView['clusters'] }) {
    const detail = (row: ReviewView['clusters']['product_date'][number]): string =>
        `${humanise(row.category_group)}, delivery ${row.delivery_date ? formatIstDay(row.delivery_date) : 'date not recorded'}`;
    return (
        <PulseSection title="3. Clusters" subtitle="Complaints that share a product and day, a driver, a drop point or a customer." isLoading={false} isEmpty={false} emptyText="">
            <ClusterList title="Same product, same delivery day" rows={clusters.product_date} extra={detail} />
            <ClusterList title="Same driver" rows={clusters.driver} />
            <ClusterList title="Same drop point" rows={clusters.drop_point} />
            <h3 className="text-sm font-semibold text-slate-300">Repeat complainers</h3>
            {clusters.repeat_complainers.length === 0 ? <p className="py-2 text-sm text-slate-500">No customer complained twice.</p> : (
                <ul className="text-sm text-slate-200">
                    {clusters.repeat_complainers.map((row) => (
                        <li key={`${row.backend_user_id ?? ''}:${row.customer_phone}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800/60 py-2 first:border-t-0">
                            <span className="font-medium">{row.customer_name ?? 'Not recorded'}</span>
                            <span className="text-slate-400">{row.customer_phone}</span>
                            <span>{row.n} complaints</span>
                            <TicketLinks ticketNos={row.ticket_nos} />
                            <CreateActionItemButton />
                        </li>
                    ))}
                </ul>
            )}
        </PulseSection>
    );
}
