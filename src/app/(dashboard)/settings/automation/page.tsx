'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import { Clock, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatApiDate } from '@/lib/dateUtils';

interface Setting {
    setting_id: number;
    title: string;
    value: string;
    updated_at?: string;
}

interface CronJob {
    key: string;
    name: string;
    flagTitle: string;
    timeTitle: string | null;
    everyMinute?: boolean;
    description: string;
}

// Each job's enable flag and run-time live in app_settings, keyed by title.
// Mirrors src/cron/scheduler.js + 022_cron_job_flags.sql in the backend.
const CRON_JOBS: CronJob[] = [
    {
        key: 'generate-delivery-list',
        name: 'Auto-Generate Delivery List',
        flagTitle: 'Auto-Generate Delivery List',
        // Dedicated cron-time setting (migration 024). Independent of the
        // customer-facing "Sale availability Ends at" — the operator can
        // shift the cron run time without moving the order cutoff.
        timeTitle: 'Auto-Generate Delivery List Time',
        description:
            "Generates tomorrow's delivery / order list automatically at the configured time. " +
            'Independent of the customer order cutoff (set in Settings → General). ' +
            'When OFF, generate the list manually from the Delivery List screen.',
    },
    {
        key: 'low-balance-reminder',
        name: 'Low-Balance Reminder',
        flagTitle: 'Low Balance Reminder Enabled',
        timeTitle: 'Low Balance Reminder Time',
        description:
            'Sends a wallet low-balance reminder to opted-in customers whose balance is below their projected threshold.',
    },
    {
        key: 'sales-incentive',
        name: 'Daytime Sales Incentive',
        flagTitle: 'Daytime Incentive Enabled',
        timeTitle: 'Daytime Incentive Run Time',
        description:
            'Computes the daily sales-incentive rows for day-time sales executives after the order cutoff.',
    },
    {
        key: 'dispatch-broadcasts',
        name: 'Broadcast Dispatcher',
        flagTitle: 'Dispatch Broadcasts Enabled',
        timeTitle: null,
        everyMinute: true,
        description:
            'Sends scheduled WhatsApp / push broadcasts the moment they fall due. Runs every minute.',
    },
];

// Values that mean "off". Everything else (incl. unknown) means "on" —
// matches parseEnabledFlag() in the backend (fail-open).
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled', '']);

function isEnabled(value: string | undefined): boolean {
    if (value == null) return true;
    return !DISABLED_VALUES.has(value.trim().toLowerCase());
}

export default function AutomationSettingsPage() {
    const queryClient = useQueryClient();
    const [pendingKey, setPendingKey] = useState<string | null>(null);
    // Per-job draft HH:MM value while the operator is editing the time input.
    // Cleared after a successful save. Lets us show a Save button only when
    // the input value differs from the persisted setting.
    const [timeEdits, setTimeEdits] = useState<Record<string, string>>({});

    const { data: settings = [], isLoading } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const response = await GET<Setting[]>('/get_settings');
            return response.data || [];
        },
    });

    const findByTitle = (title: string) => settings.find((s) => s.title === title);

    const handleSaveTime = async (job: CronJob) => {
        if (!job.timeTitle) return;
        const timeRow = findByTitle(job.timeTitle);
        if (!timeRow) {
            toast.error(`Setting "${job.timeTitle}" not found — run the matching migration first`);
            return;
        }
        const next = timeEdits[job.key];
        if (next == null || next === '' || next === timeRow.value) return;
        setPendingKey(job.key);
        try {
            await POST('/update_settings', { setting_id: timeRow.setting_id, value: next });
            await queryClient.invalidateQueries({ queryKey: ['settings'] });
            setTimeEdits((prev) => {
                const copy = { ...prev };
                delete copy[job.key];
                return copy;
            });
            toast.success(`${job.name} time updated to ${next} IST`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update time');
        } finally {
            setPendingKey(null);
        }
    };

    const handleToggle = async (job: CronJob) => {
        const flag = findByTitle(job.flagTitle);
        if (!flag) {
            toast.error(`Setting "${job.flagTitle}" not found — run migration 022_cron_job_flags.sql`);
            return;
        }
        const next = isEnabled(flag.value) ? '0' : '1';
        setPendingKey(job.key);
        try {
            await POST('/update_settings', { setting_id: flag.setting_id, value: next });
            await queryClient.invalidateQueries({ queryKey: ['settings'] });
            toast.success(`${job.name} ${next === '1' ? 'enabled' : 'disabled'}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update setting');
        } finally {
            setPendingKey(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Clock className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">Automation</h1>
                    <p className="text-slate-400">Enable or disable scheduled background jobs (cron)</p>
                </div>
            </div>

            <div className="glass rounded-xl p-4 flex items-start gap-3 text-sm text-slate-300">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p>
                    These jobs run on the backend scheduler. Turning one OFF stops it
                    immediately — no redeploy needed; the change takes effect within a minute.
                </p>
            </div>

            {isLoading ? (
                <p className="text-slate-400">Loading…</p>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {CRON_JOBS.map((job) => {
                        const flag = findByTitle(job.flagTitle);
                        const timeRow = job.timeTitle ? findByTitle(job.timeTitle) : null;
                        const enabled = flag ? isEnabled(flag.value) : true;
                        const missing = !flag;
                        const busy = pendingKey === job.key;
                        return (
                            <div key={job.key} className="glass rounded-xl p-5 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-white font-semibold">{job.name}</h2>
                                        {job.everyMinute ? (
                                            <p className="text-xs text-slate-500 mt-0.5">Runs every minute</p>
                                        ) : timeRow ? (
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <label className="text-xs text-slate-500">Run at</label>
                                                <input
                                                    type="time"
                                                    value={timeEdits[job.key] ?? timeRow.value}
                                                    onChange={(e) =>
                                                        setTimeEdits((prev) => ({ ...prev, [job.key]: e.target.value }))
                                                    }
                                                    className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                                />
                                                <span className="text-xs text-slate-500">IST</span>
                                                {timeEdits[job.key] !== undefined &&
                                                    timeEdits[job.key] !== timeRow.value && (
                                                        <button
                                                            onClick={() => handleSaveTime(job)}
                                                            disabled={busy}
                                                            className="px-2 py-1 text-xs rounded-lg bg-purple-500/30 text-purple-200 hover:bg-purple-500/40 disabled:opacity-50"
                                                        >
                                                            Save
                                                        </button>
                                                    )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-amber-400 mt-0.5">
                                                Time setting &quot;{job.timeTitle}&quot; missing — run the matching migration.
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleToggle(job)}
                                        disabled={busy || missing}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium shrink-0 disabled:opacity-50 ${enabled
                                            ? 'bg-green-500/20 text-green-400'
                                            : 'bg-red-500/20 text-red-400'
                                            }`}
                                    >
                                        {enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                        {enabled ? 'Enabled' : 'Disabled'}
                                    </button>
                                </div>
                                <p className="text-sm text-slate-400">{job.description}</p>
                                {missing && (
                                    <p className="text-xs text-amber-400">
                                        Flag not configured — run migration 022_cron_job_flags.sql.
                                        Until then the job defaults to enabled.
                                    </p>
                                )}
                                {flag?.updated_at && (
                                    <p className="text-xs text-slate-600">
                                        Updated {formatApiDate(flag.updated_at, 'dd MMM yyyy HH:mm', 'N/A')}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
