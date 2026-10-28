'use client';

/**
 * B2B shop setup for one customer — shown in the B2B / B2C edit dialog
 * (moved from the user edit page).
 *
 * A B2B SHOP is a customer with its own truck stop (a 'shop' drop point): its
 * orders ride the truck, never a last-mile driver, and bill by invoice instead of
 * the wallet. That is NOT the GST customer type — any GSTIN holder is B2B for GST.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Store } from 'lucide-react';
import { toast } from 'sonner';
import { GET, POST } from '@/lib/api';
import { previousMonthBounds } from '@/lib/accounting';

interface B2bStatus {
    is_b2b: number; // a shop (has its truck stop)
    gst_b2b?: number;
    billing_cycle: number; // 0 one bill per day, 1 monthly, 2 weekly
    drop_point_id: number | null;
    route_order: number | null;
}

type PendingChange = 'mark' | 'remove' | null;

const CYCLE_OPTIONS = [
    { value: 0, label: 'Daily' },
    { value: 2, label: 'Weekly' },
    { value: 1, label: 'Monthly' },
];

const CYCLE_HINT: Record<number, string> = {
    0: 'Daily — one invoice per day for all its delivered lines (made each evening).',
    2: "Weekly — one invoice per statement week (Mon–Sun by default), made on the statement day before the statement.",
    1: 'Monthly — one consolidated invoice per month, made on the 1st.',
};

// Same key the new-order page reads, so a change here shows there too.
const statusKey = (userId: number) => ['customer-b2b-status', userId] as const;

const CONFIRM_TEXT: Record<Exclude<PendingChange, null>, string> = {
    mark: 'Its orders will go on the truck as a shop stop and be billed by invoice, not the wallet. Any driver assigned to its orders is removed.',
    remove: 'Its truck stop is deleted and its orders stop going on the truck. It stays B2B for GST. Assign a driver to its orders afterwards.',
};

export function B2bShopPanel({ userId }: { userId: number }) {
    const queryClient = useQueryClient();
    const [saving, setSaving] = useState(false);
    const [pending, setPending] = useState<PendingChange>(null);

    const { data: status, isLoading } = useQuery({
        queryKey: statusKey(userId),
        queryFn: async () => (await GET<B2bStatus>(`/admin/customer_b2b_status/${userId}`)).data,
    });

    const refresh = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: statusKey(userId) }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'customers'] }),
        queryClient.invalidateQueries({ queryKey: ['drop-points'] }),
    ]);

    const save = async (isShop: number, billingCycle: number, okMsg: string) => {
        setSaving(true);
        try {
            const saved = await POST<{ driver_links_removed?: number }>('/admin/set_b2b_shop', {
                user_id: userId, is_b2b: isShop, billing_cycle: billingCycle,
            });
            await refresh();
            const unlinked = saved.data?.driver_links_removed ?? 0;
            toast.success(unlinked > 0
                ? `${okMsg} — removed the driver from ${unlinked} order${unlinked === 1 ? '' : 's'}`
                : okMsg);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update the B2B shop');
        } finally {
            setSaving(false);
            setPending(null);
        }
    };

    // Last month, whole: the same period the 1st-of-month run bills (idempotent with
    // it). A month still running can't be billed — the server refuses it.
    const generateBill = async () => {
        const { from, to } = previousMonthBounds();
        setSaving(true);
        try {
            const r = await POST<{ invoice_number?: string }>('/admin/generate_monthly_bill', { user_id: userId, from, to });
            toast.success(r.message || 'Bill generated');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to generate bill');
        } finally {
            setSaving(false);
        }
    };

    // The statement week today falls in or last completed — the same week the
    // statement-day run bills (lines already billed are left out).
    const generateWeekBill = async () => {
        setSaving(true);
        try {
            const r = await POST<{ invoice_number?: string }>('/admin/generate_weekly_bill', { user_id: userId });
            toast.success(r.message || 'Bill generated');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to generate bill');
        } finally {
            setSaving(false);
        }
    };

    if (isLoading || !status) {
        return <div className="rounded-xl border border-slate-800/60 p-4 text-sm text-slate-500">Loading B2B shop status…</div>;
    }

    const isShop = status.is_b2b === 1;
    const cycle = [1, 2].includes(status.billing_cycle) ? status.billing_cycle : 0;

    return (
        <div className="rounded-xl border border-slate-800/60 p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-white font-semibold flex items-center gap-2"><Store className="w-4 h-4 text-purple-400" /> B2B shop</h3>
                    <p className="text-xs text-slate-500 mt-1">
                        {isShop
                            ? 'Delivered by the truck as a shop stop and billed by invoice (no wallet).'
                            : 'Not a shop. Mark it to deliver by the truck as a shop stop and bill by invoice instead of the wallet.'}
                    </p>
                </div>
                <button type="button" onClick={() => setPending(isShop ? 'remove' : 'mark')} disabled={saving}
                    className={`shrink-0 px-4 py-2 text-sm rounded-xl disabled:opacity-50 ${isShop
                        ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                        : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'}`}>
                    {isShop ? 'Remove B2B shop' : 'Mark as B2B shop'}
                </button>
            </div>

            {pending && (
                <div className="rounded-lg bg-slate-800/60 p-3 space-y-2">
                    <p className="text-xs text-slate-300">{CONFIRM_TEXT[pending]}</p>
                    <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => setPending(null)} disabled={saving}
                            className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700">Cancel</button>
                        <button type="button" disabled={saving}
                            onClick={() => (pending === 'mark'
                                ? save(1, cycle, 'Marked as B2B shop')
                                : save(0, cycle, 'Removed B2B shop'))}
                            className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/30 text-purple-200 hover:bg-purple-500/40 disabled:opacity-50">
                            {saving ? 'Saving…' : 'Confirm'}
                        </button>
                    </div>
                </div>
            )}

            {isShop && (
                <div className="border-t border-slate-800/50 pt-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-xs text-slate-500">
                            <p className="text-sm text-white flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" /> Truck stop</p>
                            Drop point #{status.drop_point_id} · route order {status.route_order ?? '—'}
                        </div>
                        <Link href="/drop-points" className="text-xs text-purple-300 hover:text-purple-200 shrink-0">
                            Set route order on Drop Points →
                        </Link>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm text-white">Billing cycle</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {CYCLE_HINT[cycle]}
                            </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            {CYCLE_OPTIONS.map((opt) => (
                                <button key={opt.value} type="button" disabled={saving || cycle === opt.value}
                                    onClick={() => save(1, opt.value, `Set to ${opt.label.toLowerCase()} billing`)}
                                    className={`px-3 py-1.5 text-xs rounded-lg disabled:cursor-default ${cycle === opt.value
                                        ? 'bg-purple-500/30 text-purple-200'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-50'}`}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {cycle === 1 && (
                        <button type="button" onClick={generateBill} disabled={saving}
                            className="w-full px-4 py-2 text-sm rounded-xl bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-50">
                            {saving ? 'Working…' : "Generate last month's bill"}
                        </button>
                    )}
                    {cycle === 2 && (
                        <button type="button" onClick={generateWeekBill} disabled={saving}
                            className="w-full px-4 py-2 text-sm rounded-xl bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-50">
                            {saving ? 'Working…' : "Generate this statement week's bill"}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
