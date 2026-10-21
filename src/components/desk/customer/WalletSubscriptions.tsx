'use client';

import type { ReactNode } from 'react';
import type { DeskActionPlacement } from '@/lib/desk/action-context';
import { CADENCE_TEXT, dayLabel, naiveLabel, orderTypeText, rupees } from '@/lib/desk/snapshot-format';
import type { CustomerSnapshot, SnapshotSubscription } from '@/lib/desk/types';

export interface WalletSubscriptionsProps {
    snapshot: CustomerSnapshot;
    slots: (placement: DeskActionPlacement) => ReactNode;
}

const HOLIDAYS_SHOWN = 5;

function present(parts: ReadonlyArray<string | null | undefined>): string[] {
    return parts.filter((part): part is string => part !== null && part !== undefined && part.trim() !== '');
}

function subscriptionMeta(subscription: SnapshotSubscription): string {
    return present([
        CADENCE_TEXT[subscription.subscription_type],
        orderTypeText(subscription.order_type),
        subscription.end_date === null ? null : `ends ${dayLabel(subscription.end_date)}`,
        rupees(subscription.order_amount),
    ]).join(' · ');
}

export function WalletSubscriptions({ snapshot, slots }: WalletSubscriptionsProps) {
    const { wallet, address, driver, drop_point: dropPoint, subscriptions, holidays, last_order: lastOrder, tomorrow } = snapshot;
    const addressText = present([address?.flat_no, address?.apartment_name, address?.area, address?.pincode]).join(', ');
    const tomorrowRows = tomorrow.rows.length;
    return (
        <section className="glass space-y-2 rounded-xl p-3 text-sm">
            <p className="text-slate-300">
                <span className="text-slate-400">Wallet </span>
                {wallet === null ? '—' : (
                    <span className={wallet.low_balance ? 'text-red-400' : 'text-white'}>
                        {rupees(wallet.balance)}
                        {wallet.low_balance ? ` · low (below ${rupees(wallet.low_balance_threshold)})` : ''}
                    </span>
                )}
            </p>
            <p className="text-slate-300">{addressText === '' ? 'No address on file' : addressText}</p>
            <p className="text-slate-300">
                <span className="text-slate-400">Driver </span>{driver?.name ?? '—'}{dropPoint ? ` · ${dropPoint.title}` : ''}
            </p>
            <p className="font-medium text-white">{subscriptions.length > 0 ? `Subscriptions (${subscriptions.length})` : 'No active subscription'}</p>
            {subscriptions.map((subscription) => (
                <div key={subscription.order_id} className="space-y-1">
                    <p className="text-slate-200">
                        {present([subscription.product_title, subscription.qty_text]).join(' ')} × {subscription.qty}
                        {subscription.state === 'upcoming' && subscription.start_date !== null ? (
                            <span className="text-amber-300"> · starts {dayLabel(subscription.start_date)}</span>
                        ) : null}
                    </p>
                    <p className="text-xs text-slate-400">{subscriptionMeta(subscription)}</p>
                    <div className="flex flex-wrap gap-2 empty:hidden">{slots({ at: 'subscription', subscription })}</div>
                </div>
            ))}
            {holidays.length > 0 ? (
                <p className="text-slate-300">
                    <span className="text-slate-400">Holidays: </span>
                    {holidays.slice(0, HOLIDAYS_SHOWN).map((holiday) => dayLabel(holiday.date)).join(', ')}
                    {holidays.length > HOLIDAYS_SHOWN ? ` +${holidays.length - HOLIDAYS_SHOWN}` : ''}
                </p>
            ) : null}
            <p className="text-slate-300">
                <span className="text-slate-400">Last order: </span>
                {lastOrder === null ? 'none' : `${lastOrder.channel === 'app' ? 'App' : 'Day order'} · ${lastOrder.title} · ${rupees(lastOrder.amount)} · ${naiveLabel(lastOrder.created_at)}`}
            </p>
            <p className="text-xs text-slate-400">
                Tomorrow ({dayLabel(tomorrow.date)}): {tomorrow.list_generated ? 'list generated' : 'list not generated yet'} · cutoff {tomorrow.cutoff}
                {tomorrow.cutoff_passed ? ' (passed)' : ''}
                {tomorrowRows > 0 ? ` · ${tomorrowRows} item${tomorrowRows === 1 ? '' : 's'}` : ''}
            </p>
        </section>
    );
}
