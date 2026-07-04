'use client';

import { ReactNode } from 'react';

/** Coerce pg numeric-as-string to a number (null/undefined stay null). */
export const num = (value: number | string | null | undefined): number | null => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

/** '2026-07-01…' → 'Jul 26' for chart axes and tables. */
export const monthLabel = (month: string): string => {
    const iso = String(month).slice(0, 10);
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

/** 'YYYY-MM-DD…' → 'DD Mon'. */
export const dayLabel = (day: string): string => {
    const iso = String(day).slice(0, 10);
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
};

/** Compact INR for chart axes: 1.2L / 3.4Cr instead of long digit runs. */
export const inrCompact = (value: number): string => {
    const abs = Math.abs(value);
    if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
    if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
    if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
    return `₹${Math.round(value)}`;
};

interface PulseSectionProps {
    title: string;
    subtitle: string;
    isLoading: boolean;
    /** Guided empty state, plain language for a non-tech reader. */
    emptyText: string;
    isEmpty: boolean;
    actions?: ReactNode;
    children: ReactNode;
}

export function PulseSection({ title, subtitle, isLoading, emptyText, isEmpty, actions, children }: PulseSectionProps) {
    return (
        <section className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-white">{title}</h2>
                    <p className="text-sm text-slate-400">{subtitle}</p>
                </div>
                {actions}
            </div>
            {isLoading ? (
                <div className="h-40 rounded-xl bg-slate-800/40 animate-pulse" />
            ) : isEmpty ? (
                <div className="p-6 text-center text-slate-500 text-sm">{emptyText}</div>
            ) : (
                children
            )}
        </section>
    );
}
