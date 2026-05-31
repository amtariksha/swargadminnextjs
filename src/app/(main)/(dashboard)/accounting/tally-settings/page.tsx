'use client';

import { useEffect, useState } from 'react';
import {
    useTallySettings, useTallySyncRecords, TallySyncRecord,
} from '@/hooks/useAccounting';
import {
    SYNC_STATUS_BADGE, SYNC_ENTITY_TYPE_LABELS, formatDateTime,
} from '@/lib/accounting';
import DataTable, { Column } from '@/components/DataTable';
import TabPanel from '@/components/TabPanel';
import { Power, RefreshCw, Building2, KeyRound, Server } from 'lucide-react';
import { PUT, POST } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
    'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const blankForm = {
    bridge_url: '', port: '', company_name: '',
    sales_ledger: '', round_off_ledger: '', cgst_ledger: '', sgst_ledger: '',
    igst_ledger: '', b2c_consolidation_ledger: '', default_debtor_ledger: '',
    tally_posting_enabled: 0,
    bridge_credentials: '',
};

export default function TallySettingsPage() {
    const [activeTab, setActiveTab] = useState(0);
    const { data: cfg, isLoading, refetch } = useTallySettings();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Tally bridge</h1>
                <p className="text-slate-400">
                    Company &amp; ledger mappings, posting switch, and the voucher sync queue. Records always
                    enqueue — the dispatcher only posts when the switch is on.
                </p>
            </div>

            <TabPanel
                activeTab={activeTab}
                onChange={setActiveTab}
                tabs={[
                    { label: 'Settings', content: <SettingsTab cfg={cfg} isLoading={isLoading} refetch={refetch} /> },
                    { label: 'Sync queue', content: <SyncQueueTab /> },
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

    useEffect(() => {
        if (cfg) {
            setForm({
                bridge_url: cfg.bridge_url || '',
                port: cfg.port != null ? String(cfg.port) : '',
                company_name: cfg.company_name || '',
                sales_ledger: cfg.sales_ledger || '',
                round_off_ledger: cfg.round_off_ledger || '',
                cgst_ledger: cfg.cgst_ledger || '',
                sgst_ledger: cfg.sgst_ledger || '',
                igst_ledger: cfg.igst_ledger || '',
                b2c_consolidation_ledger: cfg.b2c_consolidation_ledger || '',
                default_debtor_ledger: cfg.default_debtor_ledger || '',
                tally_posting_enabled: Number(cfg.tally_posting_enabled ?? 0),
                bridge_credentials: '',
            });
        }
    }, [cfg]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const body: Record<string, unknown> = {
                bridge_url: form.bridge_url || null,
                port: form.port !== '' ? Number(form.port) : null,
                company_name: form.company_name || null,
                sales_ledger: form.sales_ledger || null,
                round_off_ledger: form.round_off_ledger || null,
                cgst_ledger: form.cgst_ledger || null,
                sgst_ledger: form.sgst_ledger || null,
                igst_ledger: form.igst_ledger || null,
                b2c_consolidation_ledger: form.b2c_consolidation_ledger || null,
                default_debtor_ledger: form.default_debtor_ledger || null,
                tally_posting_enabled: form.tally_posting_enabled ? 1 : 0,
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

    if (isLoading) return <div className="text-slate-400 text-sm py-8 text-center">Loading…</div>;

    return (
        <form onSubmit={save} className="space-y-6">
            {/* Posting switch */}
            <div className="glass rounded-2xl p-5 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 text-white font-semibold">
                        <Power className="w-4 h-4 text-purple-400" /> Posting to Tally
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                        When off, vouchers queue as <span className="text-slate-300">pending</span> and nothing is sent.
                        Turn on once the Windows bridge host is verified.
                    </p>
                </div>
                <button type="button" onClick={togglePosting}
                    className={`px-4 py-2 rounded-xl font-medium border transition-colors ${
                        form.tally_posting_enabled
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : 'bg-slate-800/50 text-slate-400 border-slate-700/50'
                    }`}>
                    {form.tally_posting_enabled ? 'Enabled' : 'Disabled'}
                </button>
            </div>

            {/* Bridge connection */}
            <div className="glass rounded-2xl p-5 space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Server className="w-4 h-4 text-purple-400" /> Bridge connection
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-300 mb-2">Bridge URL</label>
                        <input type="text" value={form.bridge_url} placeholder="http://127.0.0.1"
                            onChange={(e) => setForm({ ...form, bridge_url: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Port</label>
                        <input type="number" value={form.port} placeholder="9000"
                            onChange={(e) => setForm({ ...form, port: e.target.value })} className={inputCls} />
                    </div>
                </div>
                <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                        <KeyRound className="w-4 h-4 text-slate-400" /> Bridge credentials
                        {hasCredentials && <span className="text-xs text-green-400">· stored</span>}
                    </label>
                    <input type="password" value={form.bridge_credentials} autoComplete="new-password"
                        placeholder={hasCredentials ? 'Leave blank to keep stored credentials' : 'Enter credentials'}
                        onChange={(e) => setForm({ ...form, bridge_credentials: e.target.value })} className={inputCls} />
                    <p className="text-xs text-slate-500 mt-1">Encrypted at rest — never returned by the API.</p>
                </div>
            </div>

            {/* Company + ledgers */}
            <div className="glass rounded-2xl p-5 space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Building2 className="w-4 h-4 text-purple-400" /> Company &amp; ledger mappings
                </h2>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Company name (in Tally)</label>
                    <input type="text" value={form.company_name}
                        onChange={(e) => setForm({ ...form, company_name: e.target.value })} className={inputCls} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <LedgerField label="Sales ledger" v={form.sales_ledger} on={(x) => setForm({ ...form, sales_ledger: x })} />
                    <LedgerField label="Default debtor ledger" v={form.default_debtor_ledger} on={(x) => setForm({ ...form, default_debtor_ledger: x })} />
                    <LedgerField label="CGST ledger" v={form.cgst_ledger} on={(x) => setForm({ ...form, cgst_ledger: x })} />
                    <LedgerField label="SGST ledger" v={form.sgst_ledger} on={(x) => setForm({ ...form, sgst_ledger: x })} />
                    <LedgerField label="IGST ledger" v={form.igst_ledger} on={(x) => setForm({ ...form, igst_ledger: x })} />
                    <LedgerField label="Round-off ledger" v={form.round_off_ledger} on={(x) => setForm({ ...form, round_off_ledger: x })} />
                    <LedgerField label="B2C consolidation ledger" v={form.b2c_consolidation_ledger} on={(x) => setForm({ ...form, b2c_consolidation_ledger: x })} />
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

function LedgerField({ label, v, on }: { label: string; v: string; on: (x: string) => void }) {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
            <input type="text" value={v} onChange={(e) => on(e.target.value)} className={inputCls} />
        </div>
    );
}

function SyncQueueTab() {
    const [statusFilter, setStatusFilter] = useState('');
    const { data, isLoading, refetch } = useTallySyncRecords(statusFilter ? { status: statusFilter } : {});
    const records = data?.data || [];
    const [retrying, setRetrying] = useState<number | null>(null);

    const retry = async (id: number) => {
        setRetrying(id);
        try {
            await POST(`/accounting/tally/sync-records/${id}/retry`, {});
            toast.success('Re-queued for sync');
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to retry');
        } finally {
            setRetrying(null);
        }
    };

    const columns: Column<TallySyncRecord>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        {
            key: 'entity_type', header: 'Voucher', width: '100px',
            render: (r) => <span className="text-xs text-slate-300">{r.voucher_type || SYNC_ENTITY_TYPE_LABELS[Number(r.entity_type)] || '—'}</span>,
        },
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
            render: (r) => r.last_error ? <span className="text-xs text-red-400 truncate block max-w-xs" title={r.last_error}>{r.last_error}</span> : <span className="text-slate-600">—</span>,
        },
        { key: 'updated_at', header: 'Updated', width: '160px', render: (r) => <span className="text-xs text-slate-400">{formatDateTime(r.updated_at)}</span> },
        {
            key: 'retry', header: '', width: '90px', sortable: false,
            render: (r) => (
                (r.status === 'failed' || r.status === 'pending') ? (
                    <button onClick={() => retry(r.id)} disabled={retrying === r.id}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700/50 disabled:opacity-50">
                        <RefreshCw className={`w-3 h-3 ${retrying === r.id ? 'animate-spin' : ''}`} /> Retry
                    </button>
                ) : null
            ),
        },
    ];

    const STATUSES = ['', 'pending', 'sent', 'confirmed', 'failed', 'skipped'];

    return (
        <div className="space-y-4">
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
