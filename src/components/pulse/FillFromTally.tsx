'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DownloadCloud, Loader2, Save } from 'lucide-react';
import { GET, PUT } from '@/lib/api';
import type { TallyDebtorBalances } from '@/hooks/useAccounting';
import { ddmmyyyy } from './shopOutstandingExport';

interface FillFromTallyProps {
    /** The date the user picked; null = let the backend default (day before the posting cutover). */
    asOf: string | null;
    /** The as-of date the section is showing. */
    date: string;
    tally: TallyDebtorBalances | null;
    onLoaded: (tally: TallyDebtorBalances) => void;
}

/** Reconcile helper: pull each shop's balance from Tally, then save them all as openings. */
export function FillFromTally({ asOf, date, tally, onLoaded }: FillFromTallyProps) {
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    const fill = async () => {
        setLoading(true);
        try {
            const res = await GET<TallyDebtorBalances>('/accounting/tally/debtor-balances', asOf ? { as_of: asOf } : undefined);
            if (res.data.tally_error) {
                toast.error(res.data.tally_error);
                return;
            }
            onLoaded(res.data);
            const linked = res.data.linked ?? res.data.shops.filter((s) => s.tally_ledger).length;
            toast.success(`Filled ${linked} shop${linked === 1 ? '' : 's'} from Tally as of ${ddmmyyyy(res.data.as_of)}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to read Tally');
        } finally {
            setLoading(false);
        }
    };

    const savable = tally?.shops.filter((s) => s.tally_balance != null) ?? [];

    const saveAll = async () => {
        if (!tally || !savable.length) return;
        let saved = 0;
        let failed = 0;
        setProgress({ done: 0, total: savable.length });
        // Sequential: each save re-reads the shop's ledger, so keep the backend load flat.
        for (const shop of savable) {
            try {
                await PUT(`/accounting/customers/${shop.user_id}/opening-balance`, { as_of: tally.as_of, balance: shop.tally_balance });
                saved += 1;
            } catch (err) {
                failed += 1;
                console.error(`Opening balance save failed for shop ${shop.user_id}`, err);
            }
            setProgress({ done: saved + failed, total: savable.length });
        }
        setProgress(null);
        const summary = `Saved ${saved} shop${saved === 1 ? '' : 's'}, ${failed} failed`;
        if (failed) toast.error(summary); else toast.success(summary);
        queryClient.invalidateQueries({ queryKey: ['pulse', 'shop-outstanding'] });
    };

    return (
        <div className="flex items-center gap-3 flex-wrap text-sm">
            <button onClick={fill} disabled={loading || progress != null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-800/50 text-slate-300 hover:text-white border border-slate-700/50 disabled:opacity-40">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                Fill from Tally
            </button>
            {tally && <>
                <span className="text-slate-400">
                    Tally{tally.company ? ` (${tally.company})` : ''} as of <span className="text-slate-200">{ddmmyyyy(tally.as_of)}</span>
                    {' · '}{tally.linked ?? savable.length} linked{tally.unlinked ? `, ${tally.unlinked} not linked` : ''}
                </span>
                <button onClick={saveAll} disabled={!savable.length || progress != null}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-xs disabled:opacity-40">
                    {progress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {progress ? `Saving ${progress.done}/${progress.total}…` : `Save all from Tally (${savable.length})`}
                </button>
                {date && tally.as_of !== date && (
                    <span className="text-xs text-amber-300">Balances brought forward as of {ddmmyyyy(tally.as_of)}</span>
                )}
            </>}
        </div>
    );
}
