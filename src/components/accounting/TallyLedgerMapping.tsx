'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Search, ScanSearch, Save } from 'lucide-react';
import { PUT } from '@/lib/api';
import {
    useTallyLedgerMapping, fetchTallyLedgerMapping,
    TallyLedgerMapping as MappingResult, TallyLedgerMappingRow,
} from '@/hooks/useAccounting';
import TallyRateLedgers from '@/components/accounting/TallyRateLedgers';

const inputCls =
    'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const DATALIST_ID = 'tally-ledger-options';

/** Section order + labels, keyed by ledger_kind. */
const SECTIONS: { kind: number; title: string; hint: string }[] = [
    { kind: 1, title: 'System ledgers', hint: 'Sales, GST, round-off, cash, bank, Razorpay commission and the B2C debtor control account.' },
    { kind: 2, title: 'B2B shops', hint: "Each shop's invoices and receipts post to its own Tally ledger." },
    { kind: 3, title: 'Vendors', hint: 'Purchase bills and payments post to the vendor’s creditor ledger.' },
    { kind: 4, title: 'Account heads, bank accounts & custom', hint: 'Expense heads on purchase bills, and the bank accounts payments and receipts go through.' },
    { kind: 5, title: 'Staff reimbursements', hint: 'What staff paid from their own pocket and were paid back.' },
];

/**
 * Map every Swarg ledger to the exact Tally ledger it posts to
 * (ledger_account.tally_ledger_name). "Check against Tally" pulls the active
 * company's ledger list once (read-only) and validates each mapping
 * client-side, so a fixed row turns green without re-asking Tally.
 */
export default function TallyLedgerMapping() {
    const queryClient = useQueryClient();
    const { data, isLoading } = useTallyLedgerMapping();
    const [check, setCheck] = useState<MappingResult | null>(null);
    const [checking, setChecking] = useState(false);
    const [query, setQuery] = useState('');
    const [postingOnly, setPostingOnly] = useState(true);

    const tallyNames = useMemo(
        () => new Set((check?.tally_ledgers || []).map((l) => l.name.toLowerCase())),
        [check],
    );
    const checked = !!check?.tally_ledgers;

    const inTally = (row: TallyLedgerMappingRow): boolean | null => {
        if (!checked) return null;
        return row.tally_ledger_name ? tallyNames.has(row.tally_ledger_name.toLowerCase()) : false;
    };

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (data?.ledgers || []).filter((r) =>
            (!postingOnly || r.posts_to_tally)
            && (!q || r.name.toLowerCase().includes(q) || (r.tally_ledger_name || '').toLowerCase().includes(q)));
    }, [data, query, postingOnly]);

    const postingRows = (data?.ledgers || []).filter((r) => r.posts_to_tally);
    const rateRows = data?.rate_ledgers || [];
    const mappedRates = rateRows.filter((r) => r.tally_ledger_name);
    const missing = checked
        ? postingRows.filter((r) => inTally(r) === false).length
            + mappedRates.filter((r) => !tallyNames.has((r.tally_ledger_name || '').toLowerCase())).length
        : null;

    const runCheck = async () => {
        setChecking(true);
        try {
            const result = await fetchTallyLedgerMapping(true);
            setCheck(result);
            queryClient.setQueryData(['accounting', 'tally-ledger-mapping'], result);
            if (result.tally_error) toast.error(`Couldn't read Tally: ${result.tally_error}`);
            else toast.success(`Read ${result.tally_ledgers?.length ?? 0} ledgers from "${result.tally_company ?? 'Tally'}"`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Check failed');
        } finally {
            setChecking(false);
        }
    };

    const onSaved = () => {
        queryClient.invalidateQueries({ queryKey: ['accounting', 'tally-ledger-mapping'] });
        queryClient.invalidateQueries({ queryKey: ['accounting', 'chart'] });
    };

    if (isLoading) return <div className="text-slate-400 text-sm py-8 text-center">Loading…</div>;

    return (
        <div className="space-y-4">
            <div className="glass rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-2xl">
                        <h2 className="text-lg font-semibold text-white">Ledger mapping</h2>
                        <p className="text-sm text-slate-400 mt-1">
                            Type the <span className="text-slate-200">exact</span> Tally ledger each Swarg ledger posts to.
                            A voucher naming a ledger Tally doesn&rsquo;t have fails on its own with a &ldquo;map this
                            ledger&rdquo; message — fix it here, then Retry it in the Sync queue.
                        </p>
                    </div>
                    <button type="button" onClick={runCheck} disabled={checking}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                        <ScanSearch className={`w-4 h-4 ${checking ? 'animate-pulse' : ''}`} />
                        {checking ? 'Reading Tally…' : 'Check against Tally'}
                    </button>
                </div>
                <MappingSummary checked={checked} missing={missing} total={postingRows.length + mappedRates.length}
                    tallyCount={check?.tally_ledgers?.length ?? 0} error={check?.tally_error ?? null}
                    company={check?.tally_company ?? null} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ledgers…"
                        className={`${inputCls} pl-9`} aria-label="Search ledgers" />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-400">
                    <input type="checkbox" checked={postingOnly} onChange={(e) => setPostingOnly(e.target.checked)} />
                    Only ledgers used on vouchers
                </label>
            </div>

            {checked && (
                <datalist id={DATALIST_ID}>
                    {(check?.tally_ledgers || []).map((l) => (
                        <option key={l.name} value={l.name}>{l.parent || ''}</option>
                    ))}
                </datalist>
            )}

            {rateRows.length > 0 && (
                // Keyed by the saved map so the inputs reset after a save.
                <TallyRateLedgers key={JSON.stringify(rateRows.map((r) => [r.rate, r.tally_ledger_name]))}
                    rows={rateRows} tallyNames={checked ? tallyNames : null} datalistId={DATALIST_ID} onSaved={onSaved} />
            )}

            {SECTIONS.map((s) => {
                const sectionRows = rows.filter((r) => r.ledger_kind === s.kind);
                if (!sectionRows.length) return null;
                return (
                    <div key={s.kind} className="glass rounded-2xl overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-700/40">
                            <div className="text-white font-medium">{s.title} <span className="text-slate-500 text-sm">({sectionRows.length})</span></div>
                            <div className="text-xs text-slate-500">{s.hint}</div>
                        </div>
                        <div className="divide-y divide-slate-700/40">
                            {sectionRows.map((r) => (
                                // Keyed by the saved name so the row's local input resets after each save.
                                <MappingRow key={`${r.id}:${r.tally_ledger_name}`} row={r} status={inTally(r)}
                                    hasOptions={checked} onSaved={onSaved} />
                            ))}
                        </div>
                    </div>
                );
            })}
            {!rows.length && (
                <div className="glass rounded-2xl p-8 text-center text-slate-500 text-sm">
                    No ledgers match. Untick &ldquo;Only ledgers used on vouchers&rdquo; to see every ledger.
                </div>
            )}
        </div>
    );
}

function MappingSummary({
    checked, missing, total, tallyCount, error, company,
}: {
    checked: boolean; missing: number | null; total: number; tallyCount: number; error: string | null; company: string | null;
}) {
    if (error) {
        return (
            <div className="text-sm rounded-xl px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-300">
                Couldn&rsquo;t read Tally: {error}. Check that Tally is running with the company open, Company name in
                Settings matches Tally exactly, the Bridge URL
                includes the port (e.g. <code>http://host:9000</code>), and the tunnel/firewall allows the server.
            </div>
        );
    }
    if (!checked) {
        return (
            <div className="text-sm text-slate-400">
                Not checked yet — click <span className="text-slate-200">Check against Tally</span> to validate all {total} posting
                ledgers against your Tally company (read-only, writes nothing).
            </div>
        );
    }
    const ok = missing === 0;
    const where = company ? `"${company}"` : 'Tally';
    return (
        <div className={`text-sm rounded-xl px-4 py-3 border ${ok
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
            {ok
                ? `All ${total} posting ledgers exist in ${where} (${tallyCount} Tally ledgers read). Safe to post.`
                : `${missing} of ${total} posting ledgers are not in ${where}. Map them below before turning posting on — pick from the dropdown of ${tallyCount} Tally ledgers.`}
        </div>
    );
}

function MappingRow({
    row, status, hasOptions, onSaved,
}: { row: TallyLedgerMappingRow; status: boolean | null; hasOptions: boolean; onSaved: () => void }) {
    const [value, setValue] = useState(row.tally_ledger_name || '');
    const [saving, setSaving] = useState(false);
    const dirty = value.trim() !== (row.tally_ledger_name || '');

    const save = async () => {
        setSaving(true);
        try {
            await PUT(`/accounting/gl/ledgers/${row.id}/tally-name`, { tally_ledger_name: value.trim() || null });
            toast.success(`${row.name} → ${value.trim() || row.name}`);
            onSaved();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save mapping');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-3 items-center px-5 py-3">
            <div className="min-w-0">
                <div className="text-sm text-white truncate" title={row.name}>{row.name}</div>
                <div className="text-xs text-slate-500 truncate">{row.code || row.group_name}</div>
            </div>
            <div className="flex items-center gap-2">
                <input value={value} onChange={(e) => setValue(e.target.value)} list={hasOptions ? DATALIST_ID : undefined}
                    placeholder={row.name} maxLength={180} aria-label={`Tally ledger for ${row.name}`}
                    onKeyDown={(e) => { if (e.key === 'Enter' && dirty) { e.preventDefault(); save(); } }}
                    className={inputCls} />
                {dirty && (
                    <button type="button" onClick={save} disabled={saving} title="Save mapping"
                        className="shrink-0 p-2 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 disabled:opacity-50">
                        <Save className="w-4 h-4" />
                    </button>
                )}
            </div>
            <StatusBadge status={dirty ? null : status} />
        </div>
    );
}

function StatusBadge({ status }: { status: boolean | null }) {
    if (status === true) {
        return <span className="flex items-center gap-1 text-xs text-emerald-400 whitespace-nowrap"><CheckCircle2 className="w-4 h-4" /> In Tally</span>;
    }
    if (status === false) {
        return <span className="flex items-center gap-1 text-xs text-red-400 whitespace-nowrap"><XCircle className="w-4 h-4" /> Not in Tally</span>;
    }
    return <span className="text-xs text-slate-600 whitespace-nowrap">—</span>;
}
