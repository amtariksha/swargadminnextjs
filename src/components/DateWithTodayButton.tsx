'use client';

import { CalendarDays, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';

interface DateWithTodayButtonProps {
    /** Currently selected date in YYYY-MM-DD form. */
    value: string;
    /** Called whenever the user picks a new date or hits "Today". */
    onChange: (date: string) => void;
    /**
     * Hide the date picker completely and only render the "Today" button.
     * Used for the Packing List tab on /production-delivery where the
     * default-tomorrow date should look greyed-out (i.e. read-only) and
     * the operator only ever presses "Today" to switch view.
     */
    pickerDisabled?: boolean;
    /** Override the "Today" button label, e.g. "Tomorrow" if needed. */
    resetLabel?: string;
    /** Date the reset button resets to (defaults to actual today). */
    resetDate?: string;
}

/**
 * <input type="date" /> + a "Today" reset button. Used by the Packing List
 * tab on the driver page (default value = tomorrow, picker greyed out, reset
 * jumps to today) and by other tabs as a regular date picker.
 *
 * Mirrors the visual pattern from src/app/(dashboard)/pre-packing-list/page.tsx
 * which we extract here so the driver page and pre-packing share the look.
 */
export default function DateWithTodayButton({
    value,
    onChange,
    pickerDisabled = false,
    resetLabel = 'Today',
    resetDate,
}: DateWithTodayButtonProps) {
    const handleReset = () => {
        const target = resetDate ?? format(new Date(), 'yyyy-MM-dd');
        onChange(target);
    };

    return (
        <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-slate-400" />
            <input
                type="date"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={pickerDisabled}
                className={`px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm
                    ${pickerDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            <button
                type="button"
                onClick={handleReset}
                title={resetLabel}
                className="flex items-center gap-1 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-300 hover:text-white text-sm"
            >
                <RotateCcw className="w-4 h-4" />
                <span>{resetLabel}</span>
            </button>
        </div>
    );
}
