'use client';

import { useEffect, useMemo } from 'react';
import { Image as ImageIcon, MessageSquare } from 'lucide-react';
import {
    NOTIFICATION_SCENARIOS,
    SCENARIO_BY_SLUG,
} from '@/lib/notificationScenarios';

interface NotificationImageRow {
    scenario: string;
    image_url: string | null;
    title: string | null;
    body: string | null;
}

interface ContentSelectorProps {
    mode: 'custom' | 'template';
    onModeChange: (mode: 'custom' | 'template') => void;

    /** Slug from NOTIFICATION_SCENARIOS, when mode === 'template'. */
    scenario: string;
    onScenarioChange: (slug: string) => void;

    title: string;
    onTitleChange: (s: string) => void;

    body: string;
    onBodyChange: (s: string) => void;

    /** { token: value } map; one entry per selected scenario's tokens. */
    tokenValues: Record<string, string>;
    onTokenValuesChange: (next: Record<string, string>) => void;

    /**
     * The /notification_images rows — used for the per-scenario image
     * preview and as a stored-template fallback when the operator picks
     * a scenario.
     */
    images: NotificationImageRow[];

    /**
     * Set to true after the operator types into title/body inputs
     * AFTER picking a scenario. The parent uses this to drop the
     * `scenario` field on submit (edit-as-custom).
     */
    onTouched: () => void;
}

/**
 * The composer's Content section. Two modes:
 *
 *   custom   — free-text title + body, no scenario tag. The
 *              backend uses scenario='broadcast' (the legacy fallback)
 *              and respects the `promotions` category opt-out.
 *
 *   template — pick a scenario; we pre-fill title + body from
 *              defaultTitle/defaultBody (or the stored /notification_images
 *              row if the operator has edited it there). Renders one
 *              `<input>` per declared token, which the parent posts as
 *              body_params. If the operator edits title or body inline,
 *              the parent treats the send as custom.
 */
export default function ContentSelector({
    mode,
    onModeChange,
    scenario,
    onScenarioChange,
    title,
    onTitleChange,
    body,
    onBodyChange,
    tokenValues,
    onTokenValuesChange,
    images,
    onTouched,
}: ContentSelectorProps) {
    const selectedScenario = mode === 'template' ? SCENARIO_BY_SLUG[scenario] : undefined;

    const imagesByScenario = useMemo(() => {
        const map: Record<string, NotificationImageRow> = {};
        for (const row of images) map[row.scenario] = row;
        return map;
    }, [images]);

    const selectedImage = mode === 'template' ? imagesByScenario[scenario] : undefined;

    // When scenario changes, pre-fill title/body from stored row or the
    // hard-coded defaults. The parent's `touched` flag resets to false
    // here too (a fresh template selection is a fresh untouched state).
    useEffect(() => {
        if (mode !== 'template' || !selectedScenario) return;
        const storedTitle = imagesByScenario[scenario]?.title;
        const storedBody = imagesByScenario[scenario]?.body;
        const nextTitle = storedTitle ?? selectedScenario.defaultTitle ?? '';
        const nextBody = storedBody ?? selectedScenario.defaultBody ?? '';
        onTitleChange(nextTitle);
        onBodyChange(nextBody);
        // Reset tokens to empty (operator types fresh values per send).
        const blankTokens: Record<string, string> = {};
        for (const tok of selectedScenario.tokens ?? []) blankTokens[tok] = '';
        onTokenValuesChange(blankTokens);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, scenario]);

    return (
        <div className="glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-white">Content</h2>
                    <p className="text-sm text-slate-400">
                        Type a custom message, or use a saved rich template.
                    </p>
                </div>
            </div>

            <div className="flex gap-2">
                <ModeChip
                    active={mode === 'custom'}
                    label="Custom"
                    onClick={() => onModeChange('custom')}
                />
                <ModeChip
                    active={mode === 'template'}
                    label="Use template"
                    onClick={() => onModeChange('template')}
                />
            </div>

            {mode === 'template' && (
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Template
                    </label>
                    <select
                        value={scenario}
                        onChange={(e) => onScenarioChange(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    >
                        <option value="">Select a template…</option>
                        {NOTIFICATION_SCENARIOS.map((s) => (
                            <option key={s.scenario} value={s.scenario}>
                                {s.label}
                            </option>
                        ))}
                    </select>

                    {selectedImage?.image_url && (
                        <div className="mt-3 rounded-xl overflow-hidden border border-slate-700/50 max-w-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={selectedImage.image_url}
                                alt={selectedScenario?.label || scenario}
                                className="w-full h-auto"
                            />
                        </div>
                    )}
                    {mode === 'template' && selectedScenario && !selectedImage?.image_url && (
                        <p className="mt-3 text-xs text-slate-500 flex items-center gap-2">
                            <ImageIcon className="w-3.5 h-3.5" />
                            No image yet for this template. Manage at{' '}
                            <a
                                href="/notifications/images"
                                className="text-purple-400 hover:underline"
                            >
                                /notifications/images
                            </a>
                            .
                        </p>
                    )}

                    {selectedScenario?.tokens && selectedScenario.tokens.length > 0 && (
                        <div className="mt-4 space-y-3">
                            <p className="text-xs text-slate-400">
                                Fill in the template variables:
                            </p>
                            {selectedScenario.tokens.map((tok) => (
                                <div key={tok}>
                                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                                        {`{${tok}}`}
                                    </label>
                                    <input
                                        type="text"
                                        value={tokenValues[tok] ?? ''}
                                        onChange={(e) =>
                                            onTokenValuesChange({
                                                ...tokenValues,
                                                [tok]: e.target.value,
                                            })
                                        }
                                        placeholder={`Value for {${tok}}`}
                                        className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                    Title
                </label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                        onTitleChange(e.target.value);
                        if (mode === 'template') onTouched();
                    }}
                    placeholder="Notification title"
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                    Message
                </label>
                <textarea
                    value={body}
                    onChange={(e) => {
                        onBodyChange(e.target.value);
                        if (mode === 'template') onTouched();
                    }}
                    rows={4}
                    placeholder={
                        mode === 'template' && selectedScenario?.defaultBody
                            ? selectedScenario.defaultBody
                            : 'Notification message…'
                    }
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                />
                {mode === 'template' && (
                    <p className="mt-2 text-xs text-slate-500">
                        Editing the title or message will send this as a one-off
                        custom message — the saved template stays unchanged.
                    </p>
                )}
            </div>
        </div>
    );
}

function ModeChip({
    active,
    label,
    onClick,
}: {
    active: boolean;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-slate-800/50 text-slate-300 border border-slate-700/50 hover:bg-slate-800'
            }`}
        >
            {label}
        </button>
    );
}
