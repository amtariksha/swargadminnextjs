'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST, PUT, ApiError } from '@/lib/api';
import { Image as ImageIcon, Save, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';

type ActionsPreset = 'none' | 'ack_only' | 'delivery_followup' | 'recharge' | 'view_order';
type ChannelId = 'transactional_high' | 'promotional_default' | 'silent_low';

interface NotificationImageRow {
    scenario: string;
    label: string;
    category: string;
    image_url: string | null;
    title: string | null;
    body: string | null;
    actions_preset: ActionsPreset;
    tap_target: string;
    channel: ChannelId;
    persist_inbox: boolean;
    updated_at: string | null;
}

interface BehaviourDraft {
    actions_preset: ActionsPreset;
    tap_target: string;
    channel: ChannelId;
    persist_inbox: boolean;
}

const ACTIONS_PRESETS: ReadonlyArray<{ value: ActionsPreset; label: string; help: string }> = [
    { value: 'none', label: 'No buttons', help: 'Tap on the body only' },
    { value: 'ack_only', label: 'Okay', help: 'Single dismiss button' },
    {
        value: 'delivery_followup',
        label: 'Okay + Not received',
        help: 'Delivery-style pair — "Not received" opens WhatsApp care',
    },
    { value: 'recharge', label: 'Recharge wallet', help: 'Single button → wallet screen' },
    { value: 'view_order', label: 'View order', help: 'Single button → order detail screen' },
];

const TAP_TARGETS: ReadonlyArray<{ value: string; label: string }> = [
    { value: '/notifications', label: 'Notification inbox' },
    { value: '/home', label: 'Home tab' },
    { value: '/wallet', label: 'Wallet / recharge' },
    { value: '/subscriptions', label: 'Subscriptions' },
    { value: '/orders/{order_id}', label: 'Order detail (uses {order_id} from push)' },
];

const CHANNELS: ReadonlyArray<{ value: ChannelId; label: string; help: string }> = [
    {
        value: 'transactional_high',
        label: 'High — banner + sound',
        help: 'OTP, delivery, wallet — anything time-critical',
    },
    {
        value: 'promotional_default',
        label: 'Default — tray, no sound',
        help: 'Marketing broadcasts, gentle nudges',
    },
    { value: 'silent_low', label: 'Silent — tray only, no badge', help: 'Background updates' },
];

/**
 * Feature 09 — notification image + text library.
 *
 * One default image per notification scenario, plus operator-editable
 * title and body strings that override the trigger's hardcoded defaults.
 * Stored in R2 (image) and `notification_image` table (text).
 *
 * Title/body support {token} substitution at send time — the available
 * tokens depend on the trigger (always `{name}` is the recipient's
 * name; product-back-in-stock also exposes `{productname}` etc.).
 */
export default function NotificationImagesPage() {
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState<string | null>(null);
    const [savingText, setSavingText] = useState<string | null>(null);
    const [savingBehaviour, setSavingBehaviour] = useState<string | null>(null);
    const [textEdits, setTextEdits] = useState<Record<string, { title: string; body: string }>>({});
    const [behaviourEdits, setBehaviourEdits] = useState<Record<string, BehaviourDraft>>({});

    const { data: images = [], isLoading } = useQuery({
        queryKey: ['notification-images'],
        queryFn: async () =>
            (await GET<NotificationImageRow[]>('/notification_images')).data || [],
    });

    // Global FCM render-mode kill switch (migration 035).
    // data_only = Flutter renders every push (new path, image + actions + deep links work in every app state)
    // notification_block = legacy FCM auto-render (emergency rollback only)
    const { data: renderMode } = useQuery({
        queryKey: ['fcm-render-mode'],
        queryFn: async () =>
            (await GET<{ mode: 'data_only' | 'notification_block' }>(
                '/notification_settings/render_mode',
            )).data?.mode ?? 'data_only',
    });
    const [savingRenderMode, setSavingRenderMode] = useState(false);

    const handleSaveRenderMode = async (mode: 'data_only' | 'notification_block') => {
        if (mode === renderMode) return;
        setSavingRenderMode(true);
        try {
            await PUT('/notification_settings/render_mode', { mode });
            toast.success(
                mode === 'data_only'
                    ? 'Switched to data-only rendering (new, recommended)'
                    : 'Switched to legacy notification-block rendering',
            );
            queryClient.invalidateQueries({ queryKey: ['fcm-render-mode'] });
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.userMessage
                    : 'Failed to update render mode',
            );
        } finally {
            setSavingRenderMode(false);
        }
    };

    // Seed the per-scenario draft state from the loaded rows. Re-runs
    // when the server state changes so the inputs stay in sync after a
    // save.
    useEffect(() => {
        const nextText: Record<string, { title: string; body: string }> = {};
        const nextBehaviour: Record<string, BehaviourDraft> = {};
        for (const row of images) {
            nextText[row.scenario] = {
                title: row.title ?? '',
                body: row.body ?? '',
            };
            nextBehaviour[row.scenario] = {
                actions_preset: row.actions_preset,
                tap_target: row.tap_target,
                channel: row.channel,
                persist_inbox: row.persist_inbox,
            };
        }
        setTextEdits(nextText);
        setBehaviourEdits(nextBehaviour);
    }, [images]);

    const handleUpload = async (scenario: string, file: File) => {
        setUploading(scenario);
        try {
            const fd = new FormData();
            fd.append('scenario', scenario);
            fd.append('image', file);
            await POST('/notification_images', fd);
            toast.success('Notification image updated');
            queryClient.invalidateQueries({ queryKey: ['notification-images'] });
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.userMessage
                    : 'Failed to upload image',
            );
        } finally {
            setUploading(null);
        }
    };

    const handleSaveText = async (row: NotificationImageRow) => {
        const draft = textEdits[row.scenario];
        if (!draft) return;
        setSavingText(row.scenario);
        try {
            await PUT('/notification_images/text', {
                scenario: row.scenario,
                title: draft.title,
                body: draft.body,
            });
            toast.success('Text updated');
            queryClient.invalidateQueries({ queryKey: ['notification-images'] });
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.userMessage
                    : 'Failed to save text',
            );
        } finally {
            setSavingText(null);
        }
    };

    const handleSaveBehaviour = async (row: NotificationImageRow) => {
        const draft = behaviourEdits[row.scenario];
        if (!draft) return;
        setSavingBehaviour(row.scenario);
        try {
            await PUT('/notification_images/behaviour', {
                scenario: row.scenario,
                actions_preset: draft.actions_preset,
                tap_target: draft.tap_target,
                channel: draft.channel,
                persist_inbox: draft.persist_inbox,
            });
            toast.success('Behaviour updated');
            queryClient.invalidateQueries({ queryKey: ['notification-images'] });
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.userMessage
                    : 'Failed to save behaviour',
            );
        } finally {
            setSavingBehaviour(null);
        }
    };

    const textInputClass =
        'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50';

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <ImageIcon className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">
                        Notification Images &amp; Text
                    </h1>
                    <p className="text-slate-400">
                        Per-scenario default image, title, and body. Triggered
                        notifications use these overrides. Empty title or body
                        means &quot;fall back to the trigger&apos;s default copy&quot;.
                    </p>
                </div>
            </div>

            <div className="glass rounded-xl p-4 space-y-2 border border-amber-500/20">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1 space-y-2">
                        <p className="text-sm text-slate-300 font-medium">
                            Push rendering mode (advanced)
                        </p>
                        <p className="text-xs text-slate-400">
                            Controls how every push is rendered on the customer app.
                            <span className="text-purple-300"> Data-only </span>
                            is the default — the Flutter app draws the notification
                            itself, so the image, action buttons, and tap deep-links
                            all work consistently whether the app is open, in the
                            background, or fully closed.{' '}
                            <span className="text-slate-300">Notification block</span>{' '}
                            is the legacy fallback (FCM draws it) — only switch back if
                            the data-only path regresses in production.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                onClick={() => handleSaveRenderMode('data_only')}
                                disabled={savingRenderMode || renderMode == null}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                                    renderMode === 'data_only'
                                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-200'
                                        : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:border-purple-500/30'
                                } disabled:opacity-50`}
                            >
                                {renderMode === 'data_only' && '✓ '}Data-only (recommended)
                            </button>
                            <button
                                onClick={() => handleSaveRenderMode('notification_block')}
                                disabled={savingRenderMode || renderMode == null}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                                    renderMode === 'notification_block'
                                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                        : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:border-amber-500/30'
                                } disabled:opacity-50`}
                            >
                                {renderMode === 'notification_block' && '✓ '}Notification block (legacy)
                            </button>
                            {savingRenderMode && (
                                <span className="text-xs text-slate-400 self-center">
                                    Saving…
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass rounded-xl p-4 text-sm text-slate-400 space-y-1">
                <p className="text-slate-300 font-medium">Token substitution</p>
                <p>
                    Title and body support <code className="text-purple-300">{'{token}'}</code> placeholders that get
                    replaced at send time. Common tokens:
                </p>
                <ul className="list-disc list-inside pl-2 text-xs">
                    <li><code className="text-purple-300">{'{name}'}</code> — the recipient&apos;s name</li>
                    <li><code className="text-purple-300">{'{productname}'}</code> — product (back-in-stock scenario)</li>
                    <li><code className="text-purple-300">{'{orderdetails}'}</code>, <code className="text-purple-300">{'{subscriptiondate}'}</code> — order scenarios</li>
                </ul>
                <p className="text-xs text-slate-500">
                    Unknown tokens are left in the message as-is so typos are visible.
                </p>
            </div>

            {isLoading ? (
                <div className="text-slate-400 p-6">Loading…</div>
            ) : (
                <div className="grid md:grid-cols-2 gap-4">
                    {images.map((row) => {
                        const draft = textEdits[row.scenario] ?? { title: '', body: '' };
                        const dirty =
                            draft.title !== (row.title ?? '') ||
                            draft.body !== (row.body ?? '');
                        const behaviourDraft = behaviourEdits[row.scenario] ?? {
                            actions_preset: row.actions_preset,
                            tap_target: row.tap_target,
                            channel: row.channel,
                            persist_inbox: row.persist_inbox,
                        };
                        const behaviourDirty =
                            behaviourDraft.actions_preset !== row.actions_preset ||
                            behaviourDraft.tap_target !== row.tap_target ||
                            behaviourDraft.channel !== row.channel ||
                            behaviourDraft.persist_inbox !== row.persist_inbox;
                        const busy =
                            savingText === row.scenario ||
                            savingBehaviour === row.scenario ||
                            uploading === row.scenario;
                        return (
                            <div
                                key={row.scenario}
                                className="glass rounded-2xl p-4 space-y-3"
                            >
                                <div>
                                    <h3 className="text-sm font-semibold text-white">
                                        {row.label}
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        {row.scenario} · {row.category}
                                    </p>
                                </div>

                                {row.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={row.image_url}
                                        alt={row.label}
                                        className="w-full h-36 object-cover rounded-xl border border-slate-700/50"
                                    />
                                ) : (
                                    <div className="w-full h-36 flex items-center justify-center rounded-xl border border-dashed border-slate-700/50 text-xs text-slate-500">
                                        No image set
                                    </div>
                                )}

                                <ImageUpload
                                    onUpload={(file) => handleUpload(row.scenario, file)}
                                />
                                {uploading === row.scenario && (
                                    <p className="text-xs text-purple-400">Uploading…</p>
                                )}

                                <div className="space-y-2 pt-2 border-t border-slate-800/50">
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">
                                            Title override
                                        </label>
                                        <input
                                            type="text"
                                            value={draft.title}
                                            onChange={(e) =>
                                                setTextEdits((prev) => ({
                                                    ...prev,
                                                    [row.scenario]: { ...draft, title: e.target.value },
                                                }))
                                            }
                                            placeholder="Leave blank to use trigger default"
                                            className={textInputClass}
                                            maxLength={250}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">
                                            Body override
                                        </label>
                                        <textarea
                                            value={draft.body}
                                            onChange={(e) =>
                                                setTextEdits((prev) => ({
                                                    ...prev,
                                                    [row.scenario]: { ...draft, body: e.target.value },
                                                }))
                                            }
                                            rows={3}
                                            placeholder="Leave blank to use trigger default"
                                            className={textInputClass}
                                            maxLength={2000}
                                        />
                                    </div>
                                    {dirty && (
                                        <button
                                            onClick={() => handleSaveText(row)}
                                            disabled={busy}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 rounded-lg text-xs font-medium disabled:opacity-50"
                                        >
                                            <Save className="w-3.5 h-3.5" />
                                            {savingText === row.scenario ? 'Saving…' : 'Save text'}
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-800/50">
                                    <p className="text-xs font-medium text-slate-300">
                                        Behaviour
                                    </p>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">
                                            Action buttons
                                        </label>
                                        <select
                                            value={behaviourDraft.actions_preset}
                                            onChange={(e) =>
                                                setBehaviourEdits((prev) => ({
                                                    ...prev,
                                                    [row.scenario]: {
                                                        ...behaviourDraft,
                                                        actions_preset: e.target.value as ActionsPreset,
                                                    },
                                                }))
                                            }
                                            className={textInputClass}
                                        >
                                            {ACTIONS_PRESETS.map((p) => (
                                                <option key={p.value} value={p.value}>
                                                    {p.label} — {p.help}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">
                                            Tap target
                                        </label>
                                        <select
                                            value={
                                                TAP_TARGETS.some((t) => t.value === behaviourDraft.tap_target)
                                                    ? behaviourDraft.tap_target
                                                    : '__custom__'
                                            }
                                            onChange={(e) => {
                                                const next = e.target.value;
                                                setBehaviourEdits((prev) => ({
                                                    ...prev,
                                                    [row.scenario]: {
                                                        ...behaviourDraft,
                                                        tap_target:
                                                            next === '__custom__'
                                                                ? behaviourDraft.tap_target
                                                                : next,
                                                    },
                                                }));
                                            }}
                                            className={textInputClass}
                                        >
                                            {TAP_TARGETS.map((t) => (
                                                <option key={t.value} value={t.value}>
                                                    {t.label} ({t.value})
                                                </option>
                                            ))}
                                            <option value="__custom__">Custom…</option>
                                        </select>
                                        {!TAP_TARGETS.some((t) => t.value === behaviourDraft.tap_target) && (
                                            <input
                                                type="text"
                                                value={behaviourDraft.tap_target}
                                                onChange={(e) =>
                                                    setBehaviourEdits((prev) => ({
                                                        ...prev,
                                                        [row.scenario]: {
                                                            ...behaviourDraft,
                                                            tap_target: e.target.value,
                                                        },
                                                    }))
                                                }
                                                placeholder="/some/route or /orders/{order_id}"
                                                className={`${textInputClass} mt-1`}
                                                maxLength={120}
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">
                                            Importance
                                        </label>
                                        <select
                                            value={behaviourDraft.channel}
                                            onChange={(e) =>
                                                setBehaviourEdits((prev) => ({
                                                    ...prev,
                                                    [row.scenario]: {
                                                        ...behaviourDraft,
                                                        channel: e.target.value as ChannelId,
                                                    },
                                                }))
                                            }
                                            className={textInputClass}
                                        >
                                            {CHANNELS.map((c) => (
                                                <option key={c.value} value={c.value}>
                                                    {c.label} — {c.help}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <label className="flex items-center gap-2 text-xs text-slate-300 pt-1">
                                        <input
                                            type="checkbox"
                                            checked={behaviourDraft.persist_inbox}
                                            onChange={(e) =>
                                                setBehaviourEdits((prev) => ({
                                                    ...prev,
                                                    [row.scenario]: {
                                                        ...behaviourDraft,
                                                        persist_inbox: e.target.checked,
                                                    },
                                                }))
                                            }
                                            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800"
                                        />
                                        Show in customer&apos;s in-app inbox
                                    </label>
                                    {behaviourDirty && (
                                        <button
                                            onClick={() => handleSaveBehaviour(row)}
                                            disabled={busy}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 rounded-lg text-xs font-medium disabled:opacity-50"
                                        >
                                            <Save className="w-3.5 h-3.5" />
                                            {savingBehaviour === row.scenario ? 'Saving…' : 'Save behaviour'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
