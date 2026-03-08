'use client';

import { ReactNode } from 'react';
import { FieldError } from 'react-hook-form';

interface FormFieldProps {
    label: string;
    error?: FieldError;
    required?: boolean;
    children: ReactNode;
    className?: string;
}

export default function FormField({ label, error, required, children, className = '' }: FormFieldProps) {
    return (
        <div className={className}>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                {label}
                {required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {children}
            {error && (
                <p className="mt-1 text-xs text-red-400">{error.message}</p>
            )}
        </div>
    );
}

// Reusable input class for consistency
export const inputClassName =
    'w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors text-sm';

export const selectClassName =
    'w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors text-sm';

export const textareaClassName =
    'w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors text-sm resize-none';
