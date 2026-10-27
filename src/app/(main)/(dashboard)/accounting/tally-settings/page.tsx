'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    useTallySettings, useTallySyncRecords, useTallyImportRuns, useTallyQueueCounts,
    TallyConfig, TallySyncRecord, TallyImportRun,
} from '@/hooks/useAccounting';
import {
    SYNC_STATUS_BADGE, SYNC_ENTITY_TYPE_LABELS, TALLY_IMPORT_RUN_TYPE_LABELS,
    TALLY_IMPORT_RUN_STATUS_BADGE, formatDate, formatDateTime,
} from '@/lib/accounting';
import DataTable, { Column } from '@/components/DataTable';
import TabPanel from '@/components/TabPanel';
import Modal from '@/components/Modal';
import TallyLedgerMapping from '@/components/accounting/TallyLedgerMapping';
import TallyMastersImport from '@/components/accounting/TallyMastersImport';
import RazorpaySettlementSync from '@/components/accounting/RazorpaySettlementSync';
import {
    Power, RefreshCw, Building2, KeyRound, Server, Download, Camera, Wand2, AlertTriangle, Send, CalendarClock,
} from 'lucide-react';
import { PUT, POST } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
    'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

// Ledger names are mapped per ledger (Ledger mapping tab → ledger_account), not
// here; the backend still accepts the legacy *_ledger fields but we no longer send them.
const blankForm = {
    bridge_url: '', company_name: '',
    tally_posting_enabled: 0,
    tally_import_enabled: 0,
    auto_create_masters: 0,
    purchase_auto_post_confidence: '',
    bridge_credentials: '',
    posting_from_date: '',
    /** '' = post as soon as created; otherwise the hour (IST) next morning. */
    daily_post_hour: '1',
};

const POST_HOUR_OPTIONS = [
    { value: '0', label: 'Each night at midnight' },
    { value: '1', label: 'Each night at 1 AM (recommended)' },
    { value: '2', label: 'Each night at 2 AM' },
    { value: '4', label: 'Each night at 4 AM' },
    { value: '6', label: 'Each morning at 6 AM' },
    { value: '', label: 'As soon as created' },
];

/** The dispatcher POSTs to bridge_url verbatim — a URL without an explicit port
 *  goes to :80, never Tally's gateway (:9000). */
const bridgeUrlProblem = (raw: string): string | null => {
    const u = raw.trim();
    if (!u) return null;
    try {
        const parsed = new URL(u);
        if (!parsed.port) return `No port in the URL — this would connect on port ${parsed.protocol === 'https:' ? 443 : 80}. Tally's gateway is usually :9000, e.g. ${parsed.protocol}//${parsed.hostname}:9000`;
        return null;
    } catch {
        return 'Enter a full URL including the port, e.g. http://100.64.0.5:9000';
    }
};

export default function TallySettingsPage() {
    const [activeTab, setActiveTab] = useState(0);
    const { data: cfg, isLoading, refetch } = useTallySettings();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Tally bridge</h1>
                <p className="text-slate-400">
                    Bridge connection, posting switch, ledger mapping, and the voucher sync queue. Records always
                    enqueue — the dispatcher only posts when the switch is on.
                </p>
            </div>

            <TabPanel
                activeTab={activeTab}
                onChange={setActiveTab}
                tabs={[
                    { label: 'Settings', content: <SettingsTab cfg={cfg} isLoading={isLoading} refetch={refetch} /> },
                    { label: 'Masters from Tally', content: <TallyMastersImport /> },
                    { label: 'Ledger mapping', content: <TallyLedgerMapping /> },
                    { label: 'Sync queue', content: <SyncQueueTab /> },
                    { label: 'Import from Tally', content: <ImportTab /> },
                ]}
            />
        </div>
    );
}

function SettingsTab({
    cfg, isLoading, refetch,
}: {
    cfg: ReturnType<typeof useTallySettings>['data'];
    isLoading: boolean;
    refetch: () => void;
}) {
    const [form, setForm] = useState(blankForm);
    const [saving, setSaving] = useState(false);
    const hasCredentials = !!cfg?.has_credentials;
    const { data: counts } = useTallyQueueCounts();
    const urlProblem = bridgeUrlProblem(form.bridge_url);

    useEffect(() => {
        if (cfg) {
            setForm({
                bridge_url: cfg.bridge_url || '',
                company_name: cfg.company_name || '',
                tally_posting_enabled: Number(cfg.tally_posting_enabled ?? 0),
                tally_import_enabled: Number(cfg.tally_import_enabled ?? 0),
                auto_create_masters: Number(cfg.auto_create_masters ?? 0),
                purchase_auto_post_confidence: cfg.purchase_auto_post_confidence != null ? String(cfg.purchase_auto_post_confidence) : '',
                bridge_credentials: '',
                posting_from_date: cfg.posting_from_date ? String(cfg.posting_from_date).slice(0, 10) : '',
                // Absent (pre-migration 121) → the default 1 AM; null → as soon as created.
                daily_post_hour: cfg.daily_post_hour === undefined ? '1' : cfg.daily_post_hour === null ? '' : String(cfg.daily_post_hour),
            });
        }
    }, [cfg]);

    /** Turning posting ON sends everything dated from the cutover — make the
     *  operator see the date and the company before it happens. */
    const confirmGoLive = (): boolean => {
        const turningOn = !Number(cfg?.tally_posting_enabled) && !!form.tally_posting_enabled;
        if (!turningOn) return true;
        if (!form.posting_from_date) {
            toast.error('Set "Post vouchers dated on or after" before turning posting on');
            return false;
        }
        const target = form.company_name.trim() || 'the open Tally company';
        return window.confirm(
            `Turn on posting to "${target}"?\n\nEvery voucher dated ${form.posting_from_date} or later is sent, oldest first; anything dated earlier is left to the accountant.`
            + (form.daily_post_hour === '' ? '' : '\n\nToday\'s vouchers wait for tonight\'s run.'));
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!confirmGoLive()) return;
        setSaving(true);
        try {
            const body: Record<string, unknown> = {
                bridge_url: form.bridge_url.trim() || null,
                company_name: form.company_name || null,
                tally_posting_enabled: form.tally_posting_enabled ? 1 : 0,
                tally_import_enabled: form.tally_import_enabled ? 1 : 0,
                auto_create_masters: form.auto_create_masters ? 1 : 0,
                // Blank keeps the stored threshold (backend treats missing/blank as "no change").
                purchase_auto_post_confidence: form.purchase_auto_post_confidence !== '' ? Number(form.purchase_auto_post_confidence) : null,
                posting_from_date: form.posting_from_date || null,
                daily_post_hour: form.daily_post_hour === '' ? null : Number(form.daily_post_hour),
            };
            // Only send credentials when the operator typed new ones — never wipe stored creds with a blank.
            if (form.bridge_credentials.trim()) body.bridge_credentials = form.bridge_credentials.trim();
            await PUT('/accounting/tally/settings', body);
            toast.success('Tally settings saved');
            setForm((f) => ({ ...f, bridge_credentials: '' }));
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const togglePosting = () => setForm((f) => ({ ...f, tally_posting_enabled: f.tally_posting_enabled ? 0 : 1 }));
    const toggleImport = () => setForm((f) => ({ ...f, tally_import_enabled: f.tally_import_enabled ? 0 : 1 }));
    const toggleAutoCreate = () => setForm((f) => ({ ...f, auto_create_masters: f.auto_create_masters ? 0 : 1 }));

    if (isLoading) return <div className="text-slate-400 text-sm py-8 text-center">Loading…</div>;

    return (
        <form onSubmit={save} className="space-y-6">
            {/* Posting switch */}
            <div className="glass rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-white font-semibold">
                            <Power className="w-4 h-4 text-purple-400" /> Posting to Tally
                        </div>
                        <p className="text-sm text-slate-400 mt-1">
                            When off, vouchers queue as <span className="text-slate-300">pending</span> and nothing is sent.
                            Before turning on: Ledger mapping shows <span className="text-slate-300">0 missing</span> and the
                            cutover date below is set
                            {counts && counts.pending > 0 && <> (<span className="text-amber-300">{counts.pending} queued now</span>)</>}.
                        </p>
                    </div>
                    <button type="button" onClick={togglePosting}
                        className={`shrink-0 px-4 py-2 rounded-xl font-medium border transition-colors ${
                            form.tally_posting_enabled
                                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                : 'bg-slate-800/50 text-slate-400 border-slate-700/50'
                        }`}>
                        {form.tally_posting_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                </div>
                <DispatchHealth cfg={cfg} />
            </div>

            {/* Daily posting: cutover + nightly run */}
            <div className="glass rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-white font-semibold">
                    <CalendarClock className="w-4 h-4 text-purple-400" /> Daily posting
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Post vouchers dated on or after</label>
                        <input type="date" value={form.posting_from_date}
                            onChange={(e) => setForm({ ...form, posting_from_date: e.target.value })} className={inputCls} />
                        <p className="text-xs text-slate-500 mt-1">
                            The cutover. Anything dated earlier is the accountant&rsquo;s to enter and never posts. Testing on the copy
                            company: the day after Tally&rsquo;s last entry (e.g. 1 Oct). Going live: the cutover agreed with the accountant.
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">When to post</label>
                        <select value={form.daily_post_hour}
                            onChange={(e) => setForm({ ...form, daily_post_hour: e.target.value })} className={inputCls}>
                            {POST_HOUR_OPTIONS.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">
                            A day&rsquo;s sales, receipts and purchases post the next morning, after same-day cancellations and
                            corrections have settled. Retail (B2C) sales always go as one voucher per day.
                        </p>
                    </div>
                </div>
            </div>

            {/* Import switch */}
            <div className="glass rounded-2xl p-5 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 text-white font-semibold">
                        <Download className="w-4 h-4 text-purple-400" /> Importing from Tally
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                        Allows the &ldquo;Import from Tally&rdquo; tab to pull vouchers and trial-balance snapshots
                        from the bridge. When off, import runs are skipped.
                    </p>
                </div>
                <button type="button" onClick={toggleImport}
                    className={`px-4 py-2 rounded-xl font-medium border transition-colors ${
                        form.tally_import_enabled
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : 'bg-slate-800/50 text-slate-400 border-slate-700/50'
                    }`}>
                    {form.tally_import_enabled ? 'Enabled' : 'Disabled'}
                </button>
            </div>

            {/* Auto-create ledgers in Tally */}
            <div className="glass rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-white font-semibold">
                        <Wand2 className="w-4 h-4 text-purple-400" /> Auto-create missing ledgers in Tally
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                        Only for a <span className="text-slate-300">fresh, empty</span> Tally company. On a company that already
                        has its chart of accounts, leave this off — it creates duplicates of ledgers that exist under a
                        slightly different name. Map them in the Ledger mapping tab instead.
                    </p>
                </div>
                <button type="button" onClick={toggleAutoCreate}
                    className={`shrink-0 px-4 py-2 rounded-xl font-medium border transition-colors ${
                        form.auto_create_masters
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-slate-800/50 text-slate-400 border-slate-700/50'
                    }`}>
                    {form.auto_create_masters ? 'On' : 'Off'}
                </button>
            </div>

            {/* OCR auto-post threshold */}
            <div className="glass rounded-2xl p-5 flex items-center justify-between gap-6">
                <div>
                    <div className="text-white font-semibold">Purchase auto-post confidence</div>
                    <p className="text-sm text-slate-400 mt-1">
                        Scanned bills at or above this OCR confidence post automatically; anything below
                        waits in the purchases review queue (0–1, default 0.9).
                    </p>
                </div>
                <input type="number" min="0" max="1" step="0.05" value={form.purchase_auto_post_confidence}
                    placeholder="0.9" aria-label="Purchase auto-post confidence"
                    onChange={(e) => setForm({ ...form, purchase_auto_post_confidence: e.target.value })}
                    className={`${inputCls} !w-28 text-right`} />
            </div>

            {/* Bridge connection */}
            <div className="glass rounded-2xl p-5 space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Server className="w-4 h-4 text-purple-400" /> Bridge connection
                </h2>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Bridge URL (with port)</label>
                    <input type="text" value={form.bridge_url} placeholder="http://100.64.0.5:9000"
                        onChange={(e) => setForm({ ...form, bridge_url: e.target.value })} className={inputCls} />
                    {urlProblem
                        ? <p className="flex items-start gap-1.5 text-xs text-amber-300 mt-1"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />{urlProblem}</p>
                        : <p className="text-xs text-slate-500 mt-1">Tally&rsquo;s XML gateway on the Windows host, reached over a private tunnel or an IP-locked firewall — never public.</p>}
                </div>
                <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                        <KeyRound className="w-4 h-4 text-slate-400" /> Bridge credentials
                        {hasCredentials && <span className="text-xs text-green-400">· stored</span>}
                    </label>
                    <input type="password" value={form.bridge_credentials} autoComplete="new-password"
                        placeholder={hasCredentials ? 'Leave blank to keep stored credentials' : 'Leave blank when posting straight to Tally'}
                        onChange={(e) => setForm({ ...form, bridge_credentials: e.target.value })} className={inputCls} />
                    <p className="text-xs text-slate-500 mt-1">
                        Only needed if an authenticating proxy sits in front of Tally (sent as a Bearer token). Tally&rsquo;s own
                        gateway has no login. Encrypted at rest — never returned by the API.
                    </p>
                </div>
            </div>

            {/* Company */}
            <div className="glass rounded-2xl p-5 space-y-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Building2 className="w-4 h-4 text-purple-400" /> Company
                </h2>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Company name (exactly as in Tally)</label>
                    <input type="text" value={form.company_name}
                        onChange={(e) => setForm({ ...form, company_name: e.target.value })} className={inputCls} />
                    <p className="text-xs text-slate-500 mt-1">
                        Swarg posts <span className="text-slate-300">only</span> into this company, so a test copy and the live books can
                        both be open. If it isn&rsquo;t open in Tally, posting waits (no retries used). Blank = the one open company;
                        with several open, posting waits until this is set. Ledger names are set per ledger in the
                        <span className="text-slate-300"> Ledger mapping</span> tab.
                    </p>
                </div>
            </div>

            <div className="flex justify-end">
                <button type="submit" disabled={saving}
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                    {saving ? 'Saving…' : 'Save settings'}
                </button>
            </div>
        </form>
    );
}

const HEALTH_TONE: Record<string, { cls: string; label: string }> = {
    ok: { cls: 'text-emerald-400', label: 'all vouchers posted' },
    partial: { cls: 'text-amber-300', label: 'some vouchers failed — see Sync queue' },
    unreachable: { cls: 'text-red-400', label: 'Tally unreachable — vouchers are waiting, no retries used' },
    company_closed: { cls: 'text-red-400', label: 'company not open in Tally — vouchers are waiting, no retries used' },
    error: { cls: 'text-red-400', label: 'error' },
};

/** Last dispatcher outcome (tally_config.last_dispatch_*, migration 118). */
function DispatchHealth({ cfg }: { cfg: TallyConfig | null | undefined }) {
    if (!cfg?.last_dispatch_at) {
        return <p className="text-xs text-slate-500">Dispatcher: no posting attempted yet.</p>;
    }
    const tone = HEALTH_TONE[cfg.last_dispatch_status || ''] || { cls: 'text-slate-400', label: cfg.last_dispatch_status || '' };
    return (
        <p className="text-xs text-slate-400">
            Last dispatch {formatDateTime(cfg.last_dispatch_at)} — <span className={tone.cls}>{tone.label}</span>
            {cfg.last_dispatch_error && (
                <span className="block text-slate-500 truncate" title={cfg.last_dispatch_error}>{cfg.last_dispatch_error}</span>
            )}
        </p>
    );
}

function SyncQueueTab() {
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState('');
    const { data, isLoading } = useTallySyncRecords(statusFilter ? { status: statusFilter } : {});
    const { data: counts } = useTallyQueueCounts();
    const { data: cfg } = useTallySettings();
    const records = data?.data || [];
    const [retrying, setRetrying] = useState<number | null>(null);
    const [bulk, setBulk] = useState<'retry' | 'send' | null>(null);
    const company = cfg?.company_name?.trim() || '';
    const cutover = cfg?.posting_from_date ? String(cfg.posting_from_date).slice(0, 10) : '';

    // Prefix covers the list AND the pending/failed counts.
    const refreshQueue = () => queryClient.invalidateQueries({ queryKey: ['accounting', 'tally-sync'] });

    const retry = async (id: number) => {
        setRetrying(id);
        try {
            await POST(`/accounting/tally/sync-records/${id}/retry`, {});
            toast.success('Re-queued for sync');
            refreshQueue();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to retry');
        } finally {
            setRetrying(null);
        }
    };

    const retryAllFailed = async () => {
        setBulk('retry');
        try {
            const res = await POST<{ requeued: number }>('/accounting/tally/sync-records/retry-failed', {});
            toast.success(`${res.data?.requeued ?? 0} failed voucher(s) re-queued`);
            refreshQueue();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to retry');
        } finally {
            setBulk(null);
        }
    };

    // The test-copy → live switch (and pulling the cutover earlier): everything
    // dated from the cutover goes to the company now named. The backend leaves
    // alone anything already posted there, so a second press can't duplicate.
    const sendFromCutover = async () => {
        if (!window.confirm(
            `Send every voucher dated ${cutover} or later to "${company}"?\n\nUse this after switching Company name from the test copy to the live books (or after moving the cutover earlier). Vouchers already in "${company}" are not sent again.\n\nThey post on the next run while posting is on.`,
        )) return;
        setBulk('send');
        try {
            const res = await POST<{ requeued: number }>('/accounting/tally/sync-records/send-from-cutover', {});
            toast.success(`${res.data?.requeued ?? 0} voucher(s) queued for ${company}`);
            refreshQueue();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to queue');
        } finally {
            setBulk(null);
        }
    };

    const columns: Column<TallySyncRecord>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        {
            key: 'entity_type', header: 'Voucher', width: '100px',
            render: (r) => (
                <span className="text-xs text-slate-300">
                    {Number(r.entity_type) === 4 ? 'B2C day' : r.voucher_type || SYNC_ENTITY_TYPE_LABELS[Number(r.entity_type)] || '—'}
                </span>
            ),
        },
        { key: 'voucher_date', header: 'Dated', width: '110px', render: (r) => <span className="text-xs text-slate-400">{formatDate(r.voucher_date)}</span> },
        { key: 'idempotency_key', header: 'Key', render: (r) => <span className="text-xs text-slate-400 font-mono">{r.idempotency_key}</span> },
        {
            key: 'status', header: 'Status', width: '110px',
            render: (r) => (
                <span className={`text-xs px-2 py-1 rounded-lg ${SYNC_STATUS_BADGE[r.status] || 'bg-slate-700/50 text-slate-400'}`}>
                    {r.status}
                </span>
            ),
        },
        { key: 'retry_count', header: 'Retries', width: '80px' },
        { key: 'tally_voucher_id', header: 'Tally ID', width: '110px', render: (r) => r.tally_voucher_id || <span className="text-slate-600">—</span> },
        {
            key: 'last_error', header: 'Last error',
            render: (r) => {
                if (r.status === 'merged') return <span className="text-xs text-purple-300">in B2C day #{r.rollup_id}</span>;
                return r.last_error
                    ? <span className={`text-xs truncate block max-w-xs ${r.status === 'skipped' ? 'text-slate-400' : 'text-red-400'}`} title={r.last_error}>{r.last_error}</span>
                    : <span className="text-slate-600">—</span>;
            },
        },
        { key: 'updated_at', header: 'Updated', width: '160px', render: (r) => <span className="text-xs text-slate-400">{formatDateTime(r.updated_at)}</span> },
        {
            key: 'retry', header: '', width: '90px', sortable: false,
            render: (r) => (
                (r.status === 'failed' || r.status === 'pending' || r.status === 'skipped') ? (
                    <button onClick={() => retry(r.id)} disabled={retrying === r.id}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700/50 disabled:opacity-50">
                        <RefreshCw className={`w-3 h-3 ${retrying === r.id ? 'animate-spin' : ''}`} /> Retry
                    </button>
                ) : null
            ),
        },
    ];

    const STATUSES = ['', 'pending', 'confirmed', 'failed', 'skipped', 'merged'];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={retryAllFailed} disabled={bulk !== null || !counts?.failed}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border bg-slate-800/50 text-slate-300 border-slate-700/50 disabled:opacity-40">
                    <RefreshCw className={`w-4 h-4 ${bulk === 'retry' ? 'animate-spin' : ''}`} />
                    {bulk === 'retry' ? 'Re-queuing…' : `Retry all failed (${counts?.failed ?? 0})`}
                </button>
                <button type="button" onClick={sendFromCutover} disabled={bulk !== null || !company || !cutover}
                    title={company && cutover ? undefined : 'Set Company name and the cutover date in Settings first'}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border bg-slate-800/50 text-slate-300 border-slate-700/50 disabled:opacity-40">
                    <Send className="w-4 h-4" />
                    {bulk === 'send' ? 'Queuing…' : `Send to ${company || 'company'} from ${cutover ? formatDate(cutover) : 'cutover'} — test → live switch`}
                </button>
            </div>
            <RazorpaySettlementSync defaultFrom={cutover || undefined} />
            <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Status:</span>
                {STATUSES.map((s) => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1.5 text-xs rounded-lg border ${
                            statusFilter === s
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50'
                        }`}>
                        {s === '' ? 'All' : s}
                    </button>
                ))}
            </div>
            <DataTable data={records} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Filter queue..." emptyMessage="No sync records" />
        </div>
    );
}

// ── Import from Tally: run controls + run history ────────────────────────────

interface ImportRunResult {
    skipped?: boolean; reason?: string; runId?: number;
    fromDate?: string; toDate?: string; asOfDate?: string; mode?: string;
    vouchersSeen?: number; vouchersImported?: number; vouchersConflicted?: number; vouchersUnmapped?: number;
    status?: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const fyStartIso = () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Indian FY starts April
    return `${year}-04-01`;
};

function ImportTab() {
    const queryClient = useQueryClient();
    const { data: runs, isLoading } = useTallyImportRuns();
    const [from, setFrom] = useState(fyStartIso());
    const [to, setTo] = useState(todayIso());
    const [mode, setMode] = useState<'sync' | 'seed'>('sync');
    const [asOn, setAsOn] = useState(todayIso());
    const [running, setRunning] = useState<'import' | 'snapshot' | null>(null);
    const [lastResult, setLastResult] = useState<ImportRunResult | null>(null);
    const [errorRun, setErrorRun] = useState<TallyImportRun | null>(null);

    const finish = (result: ImportRunResult | null, message?: string) => {
        setLastResult(result);
        if (result?.skipped) toast.warning(result.reason || 'Run skipped — Tally import is disabled');
        else toast.success(message || 'Run complete');
        queryClient.invalidateQueries({ queryKey: ['accounting', 'tally-import-runs'] });
    };

    const runImport = async () => {
        setRunning('import');
        setLastResult(null);
        try {
            const res = await POST<ImportRunResult>('/accounting/tally/import', { from, to, mode });
            finish(res.data ?? null, res.message);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setRunning(null);
        }
    };

    const runSnapshot = async () => {
        setRunning('snapshot');
        setLastResult(null);
        try {
            const res = await POST<ImportRunResult>('/accounting/tally/trial-balance-snapshot', { as_on: asOn });
            finish(res.data ?? null, res.message);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Snapshot failed');
        } finally {
            setRunning(null);
        }
    };

    const columns: Column<TallyImportRun>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        {
            key: 'run_type', header: 'Type', width: '170px',
            render: (r) => <span className="text-xs text-slate-300">{TALLY_IMPORT_RUN_TYPE_LABELS[Number(r.run_type)] || '—'}</span>,
        },
        {
            key: 'from_date', header: 'Period',
            render: (r) => (
                <span className="text-xs text-slate-400">
                    {Number(r.run_type) === 2
                        ? `as on ${formatDate(r.as_of_date)}`
                        : `${formatDate(r.from_date)} → ${formatDate(r.to_date)}`}
                </span>
            ),
        },
        {
            key: 'status', header: 'Status', width: '110px',
            render: (r) => (
                <span className={`text-xs px-2 py-1 rounded-lg ${TALLY_IMPORT_RUN_STATUS_BADGE[r.status] || 'bg-slate-700/50 text-slate-400'}`}>
                    {r.status}
                </span>
            ),
        },
        {
            key: 'vouchers_seen', header: 'Vouchers', sortable: false,
            render: (r) => Number(r.run_type) === 2 ? <span className="text-slate-600">—</span> : (
                <span className="text-xs text-slate-400">
                    {r.vouchers_imported}/{r.vouchers_seen} imported
                    {Number(r.vouchers_conflicted) > 0 && <span className="text-yellow-400"> · {r.vouchers_conflicted} conflicted</span>}
                    {Number(r.vouchers_unmapped) > 0 && <span className="text-red-400"> · {r.vouchers_unmapped} unmapped</span>}
                </span>
            ),
        },
        {
            key: 'last_error', header: 'Error',
            render: (r) => r.last_error ? (
                <button type="button" onClick={() => setErrorRun(r)}
                    className="text-xs text-red-400 truncate block max-w-xs text-left underline decoration-dotted" title="Show full error">
                    {r.last_error}
                </button>
            ) : <span className="text-slate-600">—</span>,
        },
        { key: 'created_at', header: 'Started', width: '160px', render: (r) => <span className="text-xs text-slate-400">{formatDateTime(r.created_at)}</span> },
    ];

    return (
        <div className="space-y-4">
            <div className="glass rounded-2xl p-5 space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Download className="w-4 h-4 text-purple-400" /> Run a day-book import
                </h2>
                <p className="text-sm text-slate-400">
                    Pulls vouchers from Tally for the period. <span className="text-slate-300">Sync</span> skips
                    Swarg-owned voucher types (sales/purchase/receipt); <span className="text-slate-300">Seed</span> imports
                    everything (one-time cutover). Requires the import switch (Settings tab) to be on.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">From</label>
                        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">To</label>
                        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Mode</label>
                        <select value={mode} onChange={(e) => setMode(e.target.value as 'sync' | 'seed')} className={inputCls}>
                            <option value="sync">Sync (skip Swarg-owned vouchers)</option>
                            <option value="seed">Seed (full cutover import)</option>
                        </select>
                    </div>
                    <button type="button" onClick={runImport} disabled={running !== null}
                        className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${running === 'import' ? 'animate-spin' : ''}`} />
                        {running === 'import' ? 'Importing…' : 'Run Tally import'}
                    </button>
                </div>
            </div>

            <div className="glass rounded-2xl p-5 space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Camera className="w-4 h-4 text-purple-400" /> Trial-balance snapshot
                </h2>
                <p className="text-sm text-slate-400">
                    Captures Tally&apos;s trial balance as on a date for the reconciliation report — it does not change any ledger.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">As on</label>
                        <input type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} className={inputCls} />
                    </div>
                    <button type="button" onClick={runSnapshot} disabled={running !== null}
                        className="px-5 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-200 rounded-xl font-medium disabled:opacity-50 text-sm hover:bg-slate-700/50 flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${running === 'snapshot' ? 'animate-spin' : ''}`} />
                        {running === 'snapshot' ? 'Snapshotting…' : 'Snapshot trial balance'}
                    </button>
                </div>
            </div>

            {lastResult && (
                <div className={`glass rounded-2xl p-5 text-sm ${lastResult.skipped ? 'border border-yellow-500/30' : lastResult.status === 'failed' ? 'border border-red-500/30' : 'border border-green-500/30'}`}>
                    {lastResult.skipped ? (
                        <span className="text-yellow-400">Run skipped — {lastResult.reason || 'Tally import is disabled (Settings tab)'}.</span>
                    ) : (
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-300">
                            <span>Run #{lastResult.runId} <span className="text-slate-500">({lastResult.mode || 'snapshot'})</span></span>
                            {lastResult.vouchersSeen != null && <span>{lastResult.vouchersImported}/{lastResult.vouchersSeen} vouchers imported</span>}
                            {Number(lastResult.vouchersConflicted) > 0 && <span className="text-yellow-400">{lastResult.vouchersConflicted} conflicted</span>}
                            {Number(lastResult.vouchersUnmapped) > 0 && <span className="text-red-400">{lastResult.vouchersUnmapped} unmapped ledgers</span>}
                            <span className={lastResult.status === 'failed' ? 'text-red-400' : 'text-green-400'}>{lastResult.status}</span>
                        </div>
                    )}
                </div>
            )}

            <DataTable data={runs || []} columns={columns} loading={isLoading} pageSize={50}
                emptyMessage="No import runs yet — run one above." />

            <Modal isOpen={errorRun != null} onClose={() => setErrorRun(null)}
                title={errorRun ? `Run #${errorRun.id} — error detail` : ''} size="lg">
                <pre className="text-xs text-red-300 whitespace-pre-wrap break-words bg-slate-900/60 rounded-xl p-4 max-h-96 overflow-y-auto">
                    {errorRun?.last_error}
                </pre>
            </Modal>
        </div>
    );
}
