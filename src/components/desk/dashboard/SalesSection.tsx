import { PulseSection } from '@/components/pulse/shared';
import { humanise } from '@/components/desk/reports/format';
import { formatINR } from '@/lib/accounting';
import type { DeskStats } from '@/lib/desk/types';
import { Tile } from './NowTiles';

export function SalesSection({ sales, isLoading }: { sales: DeskStats['sales'] | undefined; isLoading: boolean }) {
    return (
        <PulseSection
            title="Sales"
            subtitle="Tickets in a sales category opened in the range."
            isLoading={isLoading}
            isEmpty={false}
            emptyText=""
        >
            {sales ? (
                <>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                        <Tile label="Opened" value={sales.opened} />
                        <Tile label="Won (paid)" value={sales.won_paid} />
                        <Tile label="Won (unpaid)" value={sales.won_unpaid} hint="Payment link sent or not yet paid" />
                        <Tile label="Lost" value={sales.lost} />
                        <Tile label="Order value" value={formatINR(sales.order_value_total)} />
                    </div>
                    <table className="w-full text-sm md:w-1/2">
                        <thead>
                            <tr className="text-left text-slate-400"><th className="py-1 font-medium">Lost because</th><th className="py-1 text-right font-medium">Tickets</th></tr>
                        </thead>
                        <tbody>
                            {Object.entries(sales.lost_by_reason).map(([reason, count]) => (
                                <tr key={reason} className="border-t border-slate-800/60 text-slate-200">
                                    <td className="py-1">{humanise(reason)}</td>
                                    <td className="py-1 text-right tabular-nums">{count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            ) : null}
        </PulseSection>
    );
}
