'use client';

/**
 * Shop Deliveries — the day's B2B shop stops on the truck, one card per shop with
 * each product line, plus where the day's bills and their Tally vouchers stand.
 * Moved here from the Delivery List's "Shops" tab.
 *
 * Data: GET /get_shop_delivery_list/:date (useShopDeliveries).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar, FilePlus2, MapPin, Receipt, RefreshCw, Store } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ConfirmDialog';
import { ShopDeliveryCard } from '@/components/shop-deliveries/ShopDeliveryCard';
import { useBillShopDeliveries, useSendShopToDay, useShopDeliveries } from '@/hooks/useShopDeliveries';
import { ApiError } from '@/lib/api-error';
import { formatINR } from '@/lib/accounting';
import { type ShopStop, summariseShopDay } from '@/lib/shopBilling';

function Stat({ label, value, cls = 'text-white' }: { label: string; value: string | number; cls?: string }) {
    return (
        <div className="glass rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-lg font-semibold ${cls}`}>{value}</p>
        </div>
    );
}

export default function ShopDeliveriesPage() {
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [shopDayItem, setShopDayItem] = useState<ShopStop | null>(null);
    const [confirmBill, setConfirmBill] = useState(false);

    const { data, isLoading, isFetching, refetch } = useShopDeliveries(selectedDate);
    const billShops = useBillShopDeliveries(selectedDate);
    const sendToDay = useSendShopToDay(selectedDate);

    const shops = useMemo(() => data?.shops ?? [], [data]);
    const meta = data?.meta;
    const summary = useMemo(() => summariseShopDay(shops), [shops]);

    const handleBill = async () => {
        try {
            const r = await billShops.mutateAsync();
            toast.success(r.message || 'Bills generated');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not generate the bills');
        } finally {
            setConfirmBill(false);
        }
    };

    // Hand a whole shop's undelivered truck lines to the day pool. One billable day
    // order per shop (no wallet, GST invoice on day delivery). Truck rows stay read-only.
    const handleSendShopToDay = async (shop: ShopStop) => {
        try {
            const r = await sendToDay.mutateAsync(shop.b2b_user_id);
            toast.success(r.message || `${shop.title} sent to the day-time network`);
        } catch (error) {
            if (error instanceof ApiError && (error.code === 'already_in_day_pool' || error.status === 409)) {
                toast.info(`${shop.title} is already in the day-time pool`);
            } else {
                toast.error(error instanceof Error ? error.message : 'Could not send shop to day network');
            }
        } finally {
            setShopDayItem(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Store className="w-7 h-7 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Shop Deliveries</h1>
                        <p className="text-slate-400">B2B shops on the truck — deliveries, bills and Tally sync</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                            className="pl-10 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer" />
                    </div>
                    <button type="button" onClick={() => setConfirmBill(true)}
                        disabled={!meta?.accounting_enabled || summary.unbilled === 0 || billShops.isPending}
                        title={meta?.accounting_enabled ? "One bill per shop for the day's delivered lines that have none yet" : 'Accounting is off'}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                        <FilePlus2 className="w-4 h-4" /> Generate missing bills
                    </button>
                    <Link href="/accounting/tally-settings"
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm hover:bg-slate-700/50">
                        <Receipt className="w-4 h-4" /> Tally queue
                    </Link>
                    <Link href="/drop-points" title="Set each shop's place in the truck route (Route Order)"
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm hover:bg-slate-700/50">
                        <MapPin className="w-4 h-4" /> Route order
                    </Link>
                    <button onClick={() => refetch()} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:bg-slate-700/50">
                        <RefreshCw className={`w-5 h-5 text-slate-400 ${isFetching ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {meta && !meta.accounting_enabled && (
                <div className="glass rounded-xl p-4 text-sm text-amber-300">
                    Accounting is off, so no bills are made for shop deliveries. Turn it on under Accounting.
                </div>
            )}
            {meta?.accounting_enabled && !meta.tally_posting_enabled && (
                <div className="glass rounded-xl p-4 text-sm text-slate-400">
                    Tally posting is off — bills wait in the Tally queue until it is turned on.
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                <Stat label="Shops" value={summary.shops} />
                <Stat label="Delivered" value={`${summary.done} / ${summary.shops}`} cls="text-green-400" />
                <Stat label="Bills" value={summary.invoices} />
                <Stat label="Billed" value={formatINR(summary.billedAmount)} />
                <Stat label="Not billed" value={summary.unbilled} cls={summary.unbilled > 0 ? 'text-red-400' : 'text-white'} />
                <Stat label="In Tally" value={`${summary.inTally} / ${summary.invoices}`} cls="text-green-400" />
                <Stat label="Tally queued · failed" value={`${summary.tallyQueued} · ${summary.tallyFailed}`}
                    cls={summary.tallyFailed > 0 ? 'text-red-400' : 'text-amber-300'} />
            </div>

            {isLoading ? (
                <p className="text-slate-400 text-sm">Loading shops…</p>
            ) : shops.length === 0 ? (
                <div className="glass rounded-xl p-8 text-center text-slate-400 text-sm">
                    No B2B shop deliveries for {selectedDate}. Mark customers as B2B shops (People → B2B / B2C → Edit),
                    then generate the delivery list.
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {shops.map((shop) => (
                        <ShopDeliveryCard key={shop.b2b_user_id} shop={shop}
                            accountingEnabled={!!meta?.accounting_enabled}
                            tallyPostingEnabled={!!meta?.tally_posting_enabled}
                            onSendToDay={setShopDayItem} />
                    ))}
                </div>
            )}

            <ConfirmDialog
                isOpen={confirmBill}
                title="Generate missing bills"
                message={`Make one GST invoice per shop for the ${summary.unbilled} delivered line${summary.unbilled === 1 ? '' : 's'} on ${selectedDate} that no bill covers yet. Lines already billed are left alone. This also runs on its own every night at 22:30.`}
                confirmText="Generate"
                isLoading={billShops.isPending}
                onConfirm={handleBill}
                onCancel={() => setConfirmBill(false)}
            />

            <ConfirmDialog
                isOpen={shopDayItem !== null}
                title="Send shop to day-time network"
                message={shopDayItem
                    ? `Hand ${shopDayItem.title}'s undelivered lines to the day-time pool? A day driver can claim and deliver them, billed by GST invoice (no wallet). The shop leaves the truck list; its truck records stay unchanged.`
                    : ''}
                confirmText="Send to Day Net"
                isLoading={sendToDay.isPending}
                onConfirm={() => { if (shopDayItem) handleSendShopToDay(shopDayItem); }}
                onCancel={() => setShopDayItem(null)}
            />
        </div>
    );
}
