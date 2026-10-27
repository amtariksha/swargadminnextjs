'use client';

import { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { formatINR } from '@/lib/accounting';
import {
    TallyMasterHeadRow, TallyMasterParty, TallyMasterShopRow, TallyMasterVendorRow, TallyMatchBy, TallyMastersPlan,
} from '@/hooks/useAccounting';

export interface VendorPick { on: boolean; vendorId: number | null }
export interface ShopPick { on: boolean; tallyName: string }

const selectCls =
    'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';
const rowCls = 'grid grid-cols-1 md:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3 items-center px-5 py-3';

const MATCH_LABEL: Record<TallyMatchBy, string> = {
    gstin: 'Same GSTIN', name: 'Same name', phone: 'Same phone', similar: 'Similar name',
};

function MatchBadge({ by, score }: { by: TallyMatchBy; score: number | null }) {
    const weak = by === 'similar';
    return (
        <span className={`text-xs whitespace-nowrap px-2 py-0.5 rounded-full border ${weak
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}
            title={weak ? 'Not ticked by default — check it is the same party' : undefined}>
            {MATCH_LABEL[by]}{weak && score != null ? ` · ${Math.round(score * 100)}%` : ''}
        </span>
    );
}

const Plain = ({ children }: { children: ReactNode }) =>
    <span className="text-xs text-slate-500 whitespace-nowrap">{children}</span>;

/** Tally's closing balance (debit negative) as "₹x Dr/Cr". */
function balanceText(closing: number | null | undefined): string | null {
    if (closing == null) return null;
    if (closing === 0) return 'Nil';
    return `${formatINR(Math.abs(closing))} ${closing < 0 ? 'Dr' : 'Cr'}`;
}

function PartyCell({ party, extra }: { party: TallyMasterParty; extra?: (string | null | undefined)[] }) {
    const meta = [party.parent, party.gstin, party.phone, balanceText(party.closing), ...(extra || [])].filter(Boolean);
    return (
        <div className="min-w-0">
            <div className="text-sm text-white truncate" title={party.name}>{party.name}</div>
            {meta.length > 0 && <div className="text-xs text-slate-500 truncate">{meta.join(' · ')}</div>}
        </div>
    );
}

interface SectionProps {
    title: string;
    hint: string;
    selected: number;
    total: number;
    onAll: (on: boolean) => void;
    linked: { left: string; right: string }[];
    showLinked: boolean;
    children: ReactNode;
}

export function SectionCard({ title, hint, selected, total, onAll, linked, showLinked, children }: SectionProps) {
    return (
        <div className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/40 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-white font-medium">
                        {title} <span className="text-slate-500 text-sm">({selected} of {total} ticked{linked.length ? ` · ${linked.length} linked` : ''})</span>
                    </div>
                    <div className="text-xs text-slate-500">{hint}</div>
                </div>
                {total > 0 && (
                    <div className="flex gap-2 text-xs">
                        <button type="button" onClick={() => onAll(true)} className="px-2 py-1 rounded-md bg-slate-700/40 text-slate-300">Tick all</button>
                        <button type="button" onClick={() => onAll(false)} className="px-2 py-1 rounded-md bg-slate-700/40 text-slate-300">None</button>
                    </div>
                )}
            </div>
            <div className="divide-y divide-slate-700/40">
                {children}
                {total === 0 && <div className="px-5 py-4 text-sm text-slate-500">Nothing new to import here.</div>}
                {showLinked && linked.map((l) => (
                    <div key={`${l.left}→${l.right}`} className="flex items-center gap-2 px-5 py-2 text-xs text-slate-500">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500/70 shrink-0" />
                        <span className="truncate">{l.left} → {l.right}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function VendorRow({ row, pick, options, onChange }: {
    row: TallyMasterVendorRow; pick: VendorPick; options: NonNullable<TallyMastersPlan['vendor_options']>;
    onChange: (pick: VendorPick) => void;
}) {
    let badge: ReactNode = <Plain>New vendor</Plain>;
    if (pick.vendorId != null) {
        badge = pick.vendorId === row.vendor_id && row.match_by
            ? <MatchBadge by={row.match_by} score={row.score} />
            : <Plain>Your pick</Plain>;
    }
    return (
        <div className={rowCls}>
            <input type="checkbox" checked={pick.on} aria-label={`Import ${row.tally.name}`}
                onChange={(e) => onChange({ ...pick, on: e.target.checked })} />
            <PartyCell party={row.tally} />
            <select value={pick.vendorId ?? ''} className={selectCls} aria-label={`Swarg vendor for ${row.tally.name}`}
                onChange={(e) => onChange({ on: true, vendorId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Create new vendor</option>
                {options.map((v) => (
                    <option key={v.id} value={v.id}>Link to {v.name}{v.is_active ? '' : ' (inactive)'}</option>
                ))}
            </select>
            {badge}
        </div>
    );
}

export function HeadRow({ row, on, onChange }: { row: TallyMasterHeadRow; on: boolean; onChange: (on: boolean) => void }) {
    const under = row.tally.parent && row.tally.parent !== row.group ? `${row.group} › ${row.tally.parent}` : row.group;
    return (
        <div className={rowCls}>
            <input type="checkbox" checked={on} aria-label={`Import ${row.tally.name}`} onChange={(e) => onChange(e.target.checked)} />
            <PartyCell party={{ ...row.tally, parent: null }} />
            <div className="text-sm text-slate-300 truncate" title={under}>under {under}</div>
            <Plain>New head</Plain>
        </div>
    );
}

export function ShopRow({ row, pick, debtors, onChange }: {
    row: TallyMasterShopRow; pick: ShopPick; debtors: TallyMasterParty[]; onChange: (pick: ShopPick) => void;
}) {
    const meta = [...row.also_known_as, row.gstin].filter(Boolean).join(' · ');
    const suggested = pick.tallyName && pick.tallyName === row.tally_name && row.match_by;
    return (
        <div className={rowCls}>
            <input type="checkbox" checked={pick.on} disabled={!pick.tallyName} aria-label={`Link ${row.name}`}
                onChange={(e) => onChange({ ...pick, on: e.target.checked })} />
            <div className="min-w-0">
                <div className="text-sm text-white truncate" title={row.name}>{row.name}</div>
                {meta && <div className="text-xs text-slate-500 truncate">{meta}</div>}
            </div>
            <select value={pick.tallyName} className={selectCls} aria-label={`Tally debtor for ${row.name}`}
                onChange={(e) => onChange({ on: !!e.target.value, tallyName: e.target.value })}>
                <option value="">— pick its Tally debtor —</option>
                {debtors.map((d) => (
                    <option key={d.name} value={d.name}>{d.name}{d.gstin ? ` · ${d.gstin}` : ''}</option>
                ))}
            </select>
            {suggested && row.match_by
                ? <MatchBadge by={row.match_by} score={row.score} />
                : <Plain>{pick.tallyName ? 'Your pick' : 'No match'}</Plain>}
        </div>
    );
}
