'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Bell, History, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { GET, POST, ApiError } from '@/lib/api';
import { SCENARIO_BY_SLUG } from '@/lib/notificationScenarios';
import ContentSelector from './_components/ContentSelector';
import AudienceSelector from './_components/AudienceSelector';
import BroadcastConfirmModal from './_components/BroadcastConfirmModal';
import { useAudienceCount, type AudienceType } from './_components/useAudienceCount';

interface NotificationImageRow {
    scenario: string;
    image_url: string | null;
    title: string | null;
    body: string | null;
}

interface BroadcastRow {
    id: number;
    title: string;
    audience_type: string;
    status: string;
    category: string;
    scenario: string | null;
    recipient_count: number | null;
    sent_at: string | null;
    created_at: string | null;
}

/**
 * Send-Notification — the consolidated composer.
 *
 * Replaces the previous stub (which only `setTimeout`-ed an alert) AND
 * absorbs the audience picker + history table that used to live on the
 * legacy /broadcast page. Commit 4 will replace /broadcast with a
 * redirect → here.
 *
 * Two content modes: free-text custom, or pick from the rich-template
 * library (NOTIFICATION_SCENARIOS) — including the operator-driven
 * supply_cancelled / delayed_delivery templates with their {token}
 * inputs. Three audience options: all / specific customers / driver
 * route. Posts to the existing POST /api/broadcast.
 */
export default function NotificationsPage() {
    const queryClient = useQueryClient();

    // Content state
    const [mode, setMode] = useState<'custom' | 'template'>('custom');
    const [scenario, setScenario] = useState<string>('');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [tokenValues, setTokenValues] = useState<Record<string, string>>({});
    // Tracks whether the operator has typed into title/body AFTER picking
    // a scenario. If they have, we treat the send as a one-off custom
    // message and drop the `scenario` field — the stored template at
    // /notifications/images stays unchanged.
    const [titleBodyTouched, setTitleBodyTouched] = useState(false);

    // Audience state
    const [audienceType, setAudienceType] = useState<AudienceType>('all');
    const [userIds, setUserIds] = useState<number[]>([]);
    const [driverUserId, setDriverUserId] = useState<number | ''>('');

    // Submission state
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const { count, ready: countReady } = useAudienceCount({
        type: audienceType,
        userIds,
        driverUserId,
    });

    const { data: images = [] } = useQuery({
        queryKey: ['notification-images'],
        queryFn: async () =>
            (await GET<NotificationImageRow[]>('/notification_images')).data || [],
    });

    const { data: broadcasts = [], isLoading: historyLoading } = useQuery({
        queryKey: ['broadcasts'],
        queryFn: async () => (await GET<BroadcastRow[]>('/broadcast')).data || [],
    });

    // The scenario + body_params we'll actually POST. `null` scenario =
    // edit-as-custom; the parent strips it from the payload.
    const effectiveScenario = useMemo(() => {
        if (mode !== 'template' || !scenario) return null;
        if (titleBodyTouched) return null;
        return scenario;
    }, [mode, scenario, titleBodyTouched]);

    const selectedScenarioMeta = mode === 'template' ? SCENARIO_BY_SLUG[scenario] : undefined;
    const category = effectiveScenario
        ? selectedScenarioMeta?.category ?? 'promotions'
        : 'promotions';

    const resetForm = () => {
        setMode('custom');
        setScenario('');
        setTitle('');
        setBody('');
        setTokenValues({});
        setTitleBodyTouched(false);
        setAudienceType('all');
        setUserIds([]);
        setDriverUserId('');
    };

    const canOpenConfirm = (): boolean => {
        if (!title.trim()) {
            toast.error('Title is required');
            return false;
        }
        if (!body.trim()) {
            toast.error('Message is required');
            return false;
        }
        if (audienceType === 'custom' && userIds.length === 0) {
            toast.error('Select at least one customer');
            return false;
        }
        if (audienceType === 'driver' && (typeof driverUserId !== 'number' || driverUserId <= 0)) {
            toast.error('Pick a driver');
            return false;
        }
        if (effectiveScenario && selectedScenarioMeta?.tokens) {
            for (const tok of selectedScenarioMeta.tokens) {
                if (!tokenValues[tok] || !tokenValues[tok].trim()) {
                    toast.error(`Fill in {${tok}}`);
                    return false;
                }
            }
        }
        return true;
    };

    const handleOpenConfirm = () => {
        if (canOpenConfirm()) setConfirmOpen(true);
    };

    const handleSend = async () => {
        setSubmitting(true);
        try {
            const payload: Record<string, unknown> = {
                title: title.trim(),
                body: body.trim(),
                category,
                audience_type: audienceType,
            };
            if (audienceType === 'custom') payload.user_ids = userIds;
            if (audienceType === 'driver') payload.driver_user_id = driverUserId;

            if (effectiveScenario) {
                payload.scenario = effectiveScenario;
                if (selectedScenarioMeta?.tokens?.length) {
                    const params: Record<string, string> = {};
                    for (const tok of selectedScenarioMeta.tokens) {
                        params[tok] = tokenValues[tok] ?? '';
                    }
                    payload.body_params = params;
                }
            }

            await POST('/broadcast', payload);
            toast.success(
                typeof count === 'number'
                    ? `Sending to ${count} ${count === 1 ? 'customer' : 'customers'} — see history below.`
                    : 'Broadcast queued — see history below.',
            );
            setConfirmOpen(false);
            resetForm();
            queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
        } catch (err) {
            toast.error(err instanceof ApiError ? err.userMessage : 'Failed to send broadcast');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <Bell className="w-6 h-6 text-purple-400" />
                        <h1 className="text-2xl font-bold text-white">Notifications</h1>
                    </div>
                    <p className="text-slate-400">
                        Send a notification to all customers, a specific list, or one
                        driver&apos;s delivery route.
                    </p>
                </div>
                <a
                    href="/notifications/images"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-800 text-sm"
                >
                    <ImagePlus className="w-4 h-4" />
                    Manage templates
                </a>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <ContentSelector
                    mode={mode}
                    onModeChange={(m) => {
                        setMode(m);
                        if (m === 'custom') {
                            setScenario('');
                            setTokenValues({});
                        }
                        setTitleBodyTouched(false);
                    }}
                    scenario={scenario}
                    onScenarioChange={(s) => {
                        setScenario(s);
                        setTitleBodyTouched(false);
                    }}
                    title={title}
                    onTitleChange={setTitle}
                    body={body}
                    onBodyChange={setBody}
                    tokenValues={tokenValues}
                    onTokenValuesChange={setTokenValues}
                    images={images}
                    onTouched={() => setTitleBodyTouched(true)}
                />

                <AudienceSelector
                    audienceType={audienceType}
                    onAudienceTypeChange={setAudienceType}
                    userIds={userIds}
                    onUserIdsChange={setUserIds}
                    driverUserId={driverUserId}
                    onDriverUserIdChange={setDriverUserId}
                />
            </div>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={handleOpenConfirm}
                    disabled={submitting}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                >
                    <Send className="w-5 h-5" />
                    Send notification
                </button>
            </div>

            <RecentBroadcasts rows={broadcasts} loading={historyLoading} />

            <BroadcastConfirmModal
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleSend}
                submitting={submitting}
                title={title}
                body={body}
                scenario={effectiveScenario}
                audienceType={audienceType}
                recipientCount={countReady && typeof count === 'number' ? count : null}
            />
        </div>
    );
}

function RecentBroadcasts({
    rows,
    loading,
}: {
    rows: BroadcastRow[];
    loading: boolean;
}) {
    return (
        <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
                <History className="w-5 h-5 text-slate-400" />
                <h2 className="text-lg font-semibold text-white">Recent broadcasts</h2>
            </div>
            {loading ? (
                <p className="text-slate-400 text-sm">Loading…</p>
            ) : rows.length === 0 ? (
                <p className="text-slate-400 text-sm">No broadcasts yet.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-slate-400 border-b border-slate-700/50">
                            <tr>
                                <th className="py-2 pr-4 font-medium">When</th>
                                <th className="py-2 pr-4 font-medium">Title</th>
                                <th className="py-2 pr-4 font-medium">Audience</th>
                                <th className="py-2 pr-4 font-medium">Template</th>
                                <th className="py-2 pr-4 font-medium">Status</th>
                                <th className="py-2 pr-4 font-medium">Sent to</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-200">
                            {rows.slice(0, 25).map((r) => (
                                <tr key={r.id} className="border-b border-slate-800/50">
                                    <td className="py-2 pr-4 text-slate-400">
                                        {r.sent_at || r.created_at || '—'}
                                    </td>
                                    <td className="py-2 pr-4">{r.title}</td>
                                    <td className="py-2 pr-4 capitalize">{r.audience_type}</td>
                                    <td className="py-2 pr-4">
                                        {r.scenario ? (
                                            <code className="text-purple-300 text-xs">
                                                {r.scenario}
                                            </code>
                                        ) : (
                                            <span className="text-slate-500">custom</span>
                                        )}
                                    </td>
                                    <td className="py-2 pr-4">
                                        <StatusPill status={r.status} />
                                    </td>
                                    <td className="py-2 pr-4">
                                        {r.recipient_count ?? '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function StatusPill({ status }: { status: string }) {
    const colour =
        status === 'sent'
            ? 'bg-emerald-500/15 text-emerald-300'
            : status === 'sending'
              ? 'bg-blue-500/15 text-blue-300'
              : status === 'scheduled'
                ? 'bg-amber-500/15 text-amber-300'
                : status === 'failed'
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-slate-500/15 text-slate-300';
    return (
        <span className={`px-2 py-0.5 rounded-md text-xs ${colour}`}>{status}</span>
    );
}
