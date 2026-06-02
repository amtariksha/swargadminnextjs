'use client';

import { ReactNode } from 'react';
import { FieldError } from 'react-hook-form';

interface FormFieldProps {
    label: string;
    error?: FieldError;
    required?: boolean;
    children: ReactNode;
    className?: string;
    /**
     * Optional helper text rendered below the input in a muted style.
     * Use for short explanations of what the field controls.
     */
    hint?: string;
}

export default function FormField({ label, error, required, children, className = '', hint }: FormFieldProps) {
    return (
        <div className={className}>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                {label}
                {required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {children}
            {hint && !error && (
                <p className="mt-1 text-xs text-slate-500">{hint}</p>
            )}
            {error && (
                <p className="mt-1 text-xs text-red-400">{error.message}</p>
            )}
        </div>
    );
}

// Reusable input class for consistency.
// Date/time picker glyph visibility is handled globally in globals.css
// (::-webkit-calendar-picker-indicator), so it doesn't need per-input utilities.
export const inputClassName =
    'w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors text-sm';

// Native date/time fields otherwise fill a whole grid cell (~half the page).
// Cap on sm+ so they're content-sized and paired fields (e.g. Delivery Date /
// Delivery Time) align. Full-width below sm for mobile. Exported as standalone
// tokens too, so inputs that carry a page-local class can append the same cap.
export const dateFieldMaxWidth = 'sm:max-w-[13rem]'; // ~208px — date & time
export const datetimeFieldMaxWidth = 'sm:max-w-[15rem]'; // ~240px — datetime-local

export const dateInputClassName = `${inputClassName} ${dateFieldMaxWidth}`;
export const timeInputClassName = `${inputClassName} ${dateFieldMaxWidth}`;
export const datetimeInputClassName = `${inputClassName} ${datetimeFieldMaxWidth}`;

export const selectClassName =
    'w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors text-sm';

export const textareaClassName =
    'w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors text-sm resize-none';

// Numeric fields and short fixed-enum selects don't need a full grid cell. Cap
// them on sm+ so they're content-sized; full-width below sm for mobile. Use the
// numeric cap for number inputs (price, qty, tax, ...) and the short cap for
// selects with a small set of fixed labels. Leave data-driven / long-label
// selects (subcategory, address, driver) on the uncapped selectClassName.
export const numericFieldMaxWidth = 'sm:max-w-[12rem]'; // ~192px — numbers, short codes
export const shortFieldMaxWidth = 'sm:max-w-[16rem]'; // ~256px — fixed short-enum selects

export const numericInputClassName = `${inputClassName} ${numericFieldMaxWidth}`;
export const shortSelectClassName = `${selectClassName} ${shortFieldMaxWidth}`;
