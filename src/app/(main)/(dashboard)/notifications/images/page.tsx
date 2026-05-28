'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST, PUT, ApiError } from '@/lib/api';
import { Image as ImageIcon, Save } from 'lucide-react';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';

interface NotificationImageRow {
    scenario: string;
    label: string;
    category: string;
    image_url: string | null;
    title: string | null;
    body: string | null;
    updated_at: string | null;
}

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
    const [textEdits, setTextEdits] = useState<Record<string, { title: string; body: string }>>({});

    const { data: images = [], isLoading } = useQuery({
        queryKey: ['notification-images'],
        queryFn: async () =>
            (await GET<NotificationImageRow[]>('/notification_images')).data || [],
    });

    // Seed the per-scenario draft state from the loaded rows. Re-runs
    // when the server state changes so the inputs stay in sync after a
    // save.
    useEffect(() => {
        const next: Record<string, { title: string; body: string }> = {};
        for (const row of images) {
            next[row.scenario] = {
                title: row.title ?? '',
                body: row.body ?? '',
            };
        }
        setTextEdits(next);
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
                        const busy = savingText === row.scenario || uploading === row.scenario;
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
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
