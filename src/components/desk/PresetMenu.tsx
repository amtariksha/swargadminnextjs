'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useDeskMe } from '@/components/desk/desk-me-context';
import { MarkInternalButton } from '@/components/desk/MarkInternalButton';
import type { ResolvePreset } from '@/lib/desk/resolve-plan';

interface PresetMenuProps {
    /** Slugs of the active categories: a preset whose category was deactivated is hidden (trap 9). */
    availableSlugs: ReadonlySet<string>;
    disabled: boolean;
    disabledReason: string | null;
    onPick: (preset: ResolvePreset) => void;
    /** The ticket's contact, for "Mark number as internal…" (managers only). */
    contact?: { phone: string | null; name: string | null };
}

const PRESETS: readonly { preset: ResolvePreset; label: string; slug: string | null }[] = [
    { preset: 'spam', label: 'Spam', slug: 'spam' },
    { preset: 'wrong_number', label: 'Wrong number', slug: 'wrong_number' },
    { preset: 'internal', label: 'Internal', slug: 'internal' },
    { preset: 'no_action', label: 'No action needed', slug: null },
    { preset: 'duplicate', label: 'Duplicate of #N', slug: null },
];

export function PresetMenu({ availableSlugs, disabled, disabledReason, onPick, contact }: PresetMenuProps) {
    const me = useDeskMe();
    const [open, setOpen] = useState(false);
    const [marking, setMarking] = useState(false);
    const canMark = me.manager && contact !== undefined && contact.phone !== null;
    const visible = PRESETS.filter((item) => item.slug === null || availableSlugs.has(item.slug));
    if (visible.length === 0 || availableSlugs.size === 0) return null;
    return (
        <div className="relative">
            <button
                type="button"
                disabled={disabled}
                title={disabledReason ?? undefined}
                onClick={() => setOpen((value) => !value)}
                className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
                <MoreHorizontal className="h-4 w-4" /> More
            </button>
            {open ? (
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl">
                    {visible.map((item) => (
                        <button
                            key={item.preset}
                            type="button"
                            onClick={() => { setOpen(false); onPick(item.preset); }}
                            className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                        >
                            {item.label}
                        </button>
                    ))}
                    {canMark ? (
                        <button
                            type="button"
                            onClick={() => { setOpen(false); setMarking(true); }}
                            className="block w-full border-t border-slate-800 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                        >
                            Mark number as internal…
                        </button>
                    ) : null}
                </div>
            ) : null}
            {marking && contact !== undefined ? (
                <MarkInternalButton initialPhone={contact.phone} initialLabel={contact.name} onClose={() => setMarking(false)} />
            ) : null}
        </div>
    );
}
