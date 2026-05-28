'use client';

import { useDrivers } from '@/hooks/useData';

interface DriverPickerProps {
    value: number | '';
    onChange: (driverUserId: number | '') => void;
    disabled?: boolean;
    /** Optional label override; defaults to "Driver". */
    label?: string;
}

/**
 * Single-select driver dropdown. Wraps `useDrivers()` (which returns
 * every active driver across last-mile / truck / day roles, each tagged
 * with role_label). Used by the broadcast composer's "By delivery
 * route" audience option — broadcasts go to customers assigned to the
 * chosen driver via `order_user_assign`.
 *
 * Promoted to a shared component so the inline driver `<select>` in
 * the legacy `/broadcast` page can be retired without losing the
 * existing behaviour.
 */
export default function DriverPicker({
    value,
    onChange,
    disabled = false,
    label = 'Driver',
}: DriverPickerProps) {
    const { data: drivers = [], isLoading } = useDrivers();

    return (
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
                {label}
            </label>
            <select
                value={value === '' ? '' : String(value)}
                onChange={(e) =>
                    onChange(e.target.value === '' ? '' : Number(e.target.value))
                }
                disabled={disabled || isLoading}
                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
            >
                <option value="">
                    {isLoading ? 'Loading drivers…' : 'Select a driver'}
                </option>
                {drivers.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                        {(d.name || `Driver #${d.id}`) +
                            (d.role_label ? ` — ${d.role_label}` : '') +
                            (d.phone ? ` · ${d.phone}` : '')}
                    </option>
                ))}
            </select>
        </div>
    );
}
