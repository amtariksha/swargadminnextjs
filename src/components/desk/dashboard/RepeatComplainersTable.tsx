import Link from 'next/link';
import { PulseSection } from '@/components/pulse/shared';
import type { RepeatComplainer } from '@/lib/desk/types';

export function RepeatComplainersTable({ rows, isLoading }: { rows: RepeatComplainer[] | undefined; isLoading: boolean }) {
    return (
        <PulseSection
            title="Repeat complainers"
            subtitle="Customers with two or more complaints in 30 days, at least one in the range."
            isLoading={isLoading}
            isEmpty={rows !== undefined && rows.length === 0}
            emptyText="No customer complained twice."
        >
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-slate-400">
                        <th className="py-1 font-medium">Customer</th>
                        <th className="py-1 font-medium">Phone</th>
                        <th className="py-1 text-right font-medium">Complaints</th>
                        <th className="py-1 pl-4 font-medium">Tickets</th>
                    </tr>
                </thead>
                <tbody>
                    {(rows ?? []).map((row) => (
                        <tr key={`${row.backend_user_id ?? ''}:${row.customer_phone}`} className="border-t border-slate-800/60 text-slate-200">
                            <td className="py-1">{row.customer_name ?? 'Not recorded'}</td>
                            <td className="py-1">{row.customer_phone}</td>
                            <td className="py-1 text-right tabular-nums">{row.n}</td>
                            <td className="py-1 pl-4">
                                {row.ticket_nos.map((ticketNo) => (
                                    <Link key={ticketNo} href={`/desk?ticket=${ticketNo}`} className="mr-2 text-purple-300 underline">
                                        #{ticketNo}
                                    </Link>
                                ))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </PulseSection>
    );
}
