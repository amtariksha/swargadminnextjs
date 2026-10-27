'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DownloadCloud, Import } from 'lucide-react';
import { ApiError } from '@/lib/api-error';
import {
    fetchTallyMasters, importTallyMasters, TallyMastersImportBody, TallyMastersImportResult, TallyMastersPlan,
} from '@/hooks/useAccounting';
import {
    HeadRow, SectionCard, ShopPick, ShopRow, VendorPick, VendorRow,
} from '@/components/accounting/TallyMastersSections';

interface Picks {
    vendors: Record<string, VendorPick>;
    heads: Record<string, boolean>;
    shops: Record<number, ShopPick>;
}

const NO_PICKS: Picks = { vendors: {}, heads: {}, shops: {} };

/** Strong matches and new records start ticked; a "similar" name never does. */
function initialPicks(plan: TallyMastersPlan): Picks {
    const vendors: Picks['vendors'] = {};
    for (const r of plan.vendors || []) {
        if (r.status === 'linked') continue;
        vendors[r.tally.name] = { on: r.status === 'new' || r.match_by !== 'similar', vendorId: r.vendor_id };
    }
    const heads: Picks['heads'] = {};
    for (const r of plan.heads || []) if (r.status === 'new') heads[r.tally.name] = true;
    const shops: Picks['shops'] = {};
    for (const r of plan.shops || []) {
        if (r.status === 'linked') continue;
        shops[r.user_id] = { on: r.status === 'match' && r.match_by !== 'similar', tallyName: r.tally_name || '' };
    }
    return { vendors, heads, shops };
}

function buildBody(picks: Picks): TallyMastersImportBody {
    return {
        vendors: Object.entries(picks.vendors).filter(([, p]) => p.on)
            .map(([tallyName, p]) => ({ tally_name: tallyName, vendor_id: p.vendorId })),
        heads: Object.entries(picks.heads).filter(([, on]) => on).map(([tallyName]) => ({ tally_name: tallyName, ledger_id: null })),
        shops: Object.entries(picks.shops).filter(([, p]) => p.on && p.tallyName)
            .map(([userId, p]) => ({ user_id: Number(userId), tally_name: p.tallyName })),
    };
}

const errorText = (err: unknown): string => {
    if (err instanceof ApiError) {
        const first = Object.values(err.fieldErrors || {}).flat()[0];
        return first ? `${err.userMessage}: ${first}` : err.userMessage;
    }
    return err instanceof Error ? err.message : 'Request failed';
};

const summaryText = ({ summary: s }: TallyMastersImportResult): string => [
    s.vendors_created && `${s.vendors_created} vendors created`,
    s.vendors_linked && `${s.vendors_linked} vendors linked`,
    s.heads_created && `${s.heads_created} heads created`,
    s.heads_linked && `${s.heads_linked} heads linked`,
    s.shops_linked && `${s.shops_linked} shops linked`,
    s.unchanged && `${s.unchanged} already in place`,
].filter(Boolean).join(', ') || 'Nothing changed';

/**
 * Selective import of Tally masters: read the company (read-only), review the
 * proposed creditor ↔ vendor matches, expense heads and debtor ↔ shop links,
 * import the ticked rows. Nothing is ever written to Tally.
 */
export default function TallyMastersImport() {
    const queryClient = useQueryClient();
    const [plan, setPlan] = useState<TallyMastersPlan | null>(null);
    const [picks, setPicks] = useState<Picks>(NO_PICKS);
    const [reading, setReading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [showLinked, setShowLinked] = useState(false);

    const read = async () => {
        setReading(true);
        try {
            const next = await fetchTallyMasters();
            setPlan(next);
            setPicks(next.tally_error ? NO_PICKS : initialPicks(next));
            if (next.tally_error) toast.error(`Couldn't read Tally: ${next.tally_error}`);
        } catch (err) {
            toast.error(errorText(err));
        } finally {
            setReading(false);
        }
    };

    const body = useMemo(() => buildBody(picks), [picks]);
    const ticked = body.vendors.length + body.heads.length + body.shops.length;

    const runImport = async () => {
        const created = body.vendors.filter((v) => v.vendor_id == null).length;
        const ok = window.confirm(
            `Import into Swarg from "${plan?.company}"?\n\n`
            + `• ${body.vendors.length} vendors (${created} new)\n`
            + `• ${body.heads.length} expense / purchase heads\n`
            + `• ${body.shops.length} shop ↔ debtor links\n\nNothing is written to Tally.`);
        if (!ok) return;
        setImporting(true);
        try {
            const result = await importTallyMasters(body);
            toast.success(summaryText(result));
            queryClient.invalidateQueries({ queryKey: ['accounting'] });
            queryClient.invalidateQueries({ queryKey: ['inventory', 'vendors'] });
            await read();
        } catch (err) {
            toast.error(errorText(err));
        } finally {
            setImporting(false);
        }
    };

    const setVendor = (name: string, p: VendorPick) => setPicks((cur) => ({ ...cur, vendors: { ...cur.vendors, [name]: p } }));
    const setHead = (name: string, on: boolean) => setPicks((cur) => ({ ...cur, heads: { ...cur.heads, [name]: on } }));
    const setShop = (id: number, p: ShopPick) => setPicks((cur) => ({ ...cur, shops: { ...cur.shops, [id]: p } }));
    const tickVendors = (on: boolean) => setPicks((cur) => ({
        ...cur, vendors: Object.fromEntries(Object.entries(cur.vendors).map(([k, v]) => [k, { ...v, on }])),
    }));
    const tickHeads = (on: boolean) => setPicks((cur) => ({
        ...cur, heads: Object.fromEntries(Object.keys(cur.heads).map((k) => [k, on])),
    }));
    // A shop with no debtor picked can't be ticked.
    const tickShops = (on: boolean) => setPicks((cur) => ({
        ...cur, shops: Object.fromEntries(Object.entries(cur.shops).map(([k, v]) => [k, { ...v, on: on && !!v.tallyName }])),
    }));

    const ready = plan && !plan.tally_error;
    const vendors = plan?.vendors || [];
    const heads = plan?.heads || [];
    const shops = plan?.shops || [];

    return (
        <div className="space-y-4">
            <IntroCard plan={plan} reading={reading} onRead={read} showLinked={showLinked} setShowLinked={setShowLinked} />

            {ready && (
                <>
                    <SectionCard title="Creditors → vendors" selected={body.vendors.length} total={Object.keys(picks.vendors).length}
                        hint="Purchase bills post to the vendor's creditor ledger. Linking fills only the vendor's blank GSTIN, phone, email and address."
                        onAll={tickVendors} showLinked={showLinked}
                        linked={vendors.filter((r) => r.status === 'linked').map((r) => ({ left: r.tally.name, right: r.vendor_name || '' }))}>
                        {vendors.filter((r) => r.status !== 'linked').map((r) => (
                            <VendorRow key={r.tally.name} row={r} pick={picks.vendors[r.tally.name]}
                                options={plan.vendor_options || []} onChange={(p) => setVendor(r.tally.name, p)} />
                        ))}
                    </SectionCard>

                    <SectionCard title="Expense & purchase heads" selected={body.heads.length} total={Object.keys(picks.heads).length}
                        hint="Become account heads you can pick on purchase bills, each posting to its Tally ledger."
                        onAll={tickHeads} showLinked={showLinked}
                        linked={heads.filter((r) => r.status === 'linked').map((r) => ({ left: r.tally.name, right: r.group }))}>
                        {heads.filter((r) => r.status === 'new').map((r) => (
                            <HeadRow key={r.tally.name} row={r} on={!!picks.heads[r.tally.name]} onChange={(on) => setHead(r.tally.name, on)} />
                        ))}
                    </SectionCard>

                    <SectionCard title="Shops ↔ Tally debtors" selected={body.shops.length} total={Object.keys(picks.shops).length}
                        hint="Each B2B shop's invoices and receipts post to its Tally debtor ledger. Customers are never created from Tally."
                        onAll={tickShops} showLinked={showLinked}
                        linked={shops.filter((r) => r.status === 'linked').map((r) => ({ left: r.name, right: r.tally_name || '' }))}>
                        {shops.filter((r) => r.status !== 'linked').map((r) => (
                            <ShopRow key={r.user_id} row={r} pick={picks.shops[r.user_id]} debtors={plan.debtors || []}
                                onChange={(p) => setShop(r.user_id, p)} />
                        ))}
                    </SectionCard>

                    <div className="sticky bottom-4 glass rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-3 border border-slate-700/50">
                        <div className="text-sm text-slate-300">
                            {body.vendors.length} vendors · {body.heads.length} heads · {body.shops.length} shop links ticked
                        </div>
                        <button type="button" onClick={runImport} disabled={!ticked || importing || reading}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                            <Import className="w-4 h-4" /> {importing ? 'Importing…' : 'Import selected'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

function IntroCard({ plan, reading, onRead, showLinked, setShowLinked }: {
    plan: TallyMastersPlan | null; reading: boolean; onRead: () => void;
    showLinked: boolean; setShowLinked: (v: boolean) => void;
}) {
    const c = plan?.counts;
    return (
        <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                    <h2 className="text-lg font-semibold text-white">Masters from Tally</h2>
                    <p className="text-sm text-slate-400 mt-1">
                        Bring Tally&rsquo;s creditors in as vendors, its expense and purchase ledgers in as account heads,
                        and link each B2B shop to its Tally debtor. Swarg only <span className="text-slate-200">reads</span> Tally;
                        you tick what to import. Balances are not imported.
                    </p>
                </div>
                <button type="button" onClick={onRead} disabled={reading}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                    <DownloadCloud className={`w-4 h-4 ${reading ? 'animate-pulse' : ''}`} />
                    {reading ? 'Reading Tally…' : plan ? 'Read again' : 'Read Tally'}
                </button>
            </div>
            {plan?.tally_error && (
                <div className="text-sm rounded-xl px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-300">
                    Couldn&rsquo;t read Tally: {plan.tally_error}
                </div>
            )}
            {plan && !plan.tally_error && c && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                    <span>
                        Read {c.ledgers} ledgers from <span className="text-slate-200">&ldquo;{plan.company}&rdquo;</span>:{' '}
                        {c.creditors} creditors, {c.heads} expense / purchase ledgers, {c.debtors} debtors.
                    </span>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={showLinked} onChange={(e) => setShowLinked(e.target.checked)} />
                        Show already linked
                    </label>
                </div>
            )}
            {plan && !plan.tally_error && plan.detailed === false && (
                <div className="text-sm rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/30 text-amber-300">
                    This Tally returned names only — no GSTIN, phone or balances — so vendors match by name. Fill GSTINs on
                    new vendors afterwards.
                </div>
            )}
        </div>
    );
}
