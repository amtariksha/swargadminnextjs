'use client';

import { useMemo } from 'react';
import { useDeliveryLocations } from '@/hooks/useData';

interface DeliveryLocationMultiSelectProps {
    value: number[];
    onChange: (ids: number[]) => void;
}

/**
 * "Shippable to" picker for the product form (Phase 2 web location gating).
 * Empty selection = deliverable everywhere (no gate); ticking locations
 * restricts the product to those `available_delivery_location` rows on the
 * website. Few rows exist (~3), so no search — just toggle chips.
 */
export default function DeliveryLocationMultiSelect({
    value,
    onChange,
}: DeliveryLocationMultiSelectProps) {
    const { data: locations = [], isLoading } = useDeliveryLocations();
    const selected = useMemo(() => new Set(value), [value]);

    const toggle = (id: number) => {
        const next = new Set(value);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange([...next]);
    };

    return (
        <div className="space-y-2">
            <p className="text-xs text-slate-500">
                Leave all unchecked = deliverable everywhere. Tick locations to restrict where this
                product ships on the website (Flutter/app delivery is unaffected).
            </p>
            {isLoading ? (
                <p className="text-sm text-slate-500">Loading locations…</p>
            ) : locations.length === 0 ? (
                <p className="text-sm text-slate-500">No delivery locations configured</p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {locations.map((loc) => (
                        <label
                            key={loc.id}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm ${
                                selected.has(loc.id)
                                    ? 'bg-purple-500/20 border-purple-500/40 text-white'
                                    : 'bg-slate-800/50 border-slate-700/50 text-slate-300'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={selected.has(loc.id)}
                                onChange={() => toggle(loc.id)}
                            />
                            {loc.title || `#${loc.id}`}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
