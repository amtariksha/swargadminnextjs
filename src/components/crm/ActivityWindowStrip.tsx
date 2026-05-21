'use client';

import type { ActivityWindows } from '@/hooks/useData';
import { ACTIVITY_WINDOW_KEYS } from '@/lib/crm';

interface ActivityWindowStripProps {
    windows: ActivityWindows | null | undefined;
    daysSinceLastDelivery?: number | null;
    /** Compact mode drops the leading label — used inside table cells. */
    compact?: boolean;
}

/**
 * The 7/15/30/60/90/180-day active/inactive context strip (Feature 13).
 * Recomputed live by the backend from delivery history.
 */
export default function ActivityWindowStrip({
    windows,
    daysSinceLastDelivery,
    compact = false,
}: ActivityWindowStripProps) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {!compact && <span className="text-xs text-slate-400 mr-1">Activity:</span>}
            {ACTIVITY_WINDOW_KEYS.map((key) => {
                const active = windows?.[key] === 'active';
                return (
                    <span
                        key={key}
                        title={`${active ? 'Active' : 'Inactive'} in the last ${key} days`}
                        className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                            active
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-slate-700/40 text-slate-500'
                        }`}
                    >
                        {key}d
                    </span>
                );
            })}
            {!compact && daysSinceLastDelivery != null && (
                <span className="text-xs text-slate-400 ml-1">
                    · last delivery {daysSinceLastDelivery}d ago
                </span>
            )}
        </div>
    );
}
