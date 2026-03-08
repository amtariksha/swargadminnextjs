'use client';

import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onChange: (start: string, end: string) => void;
}

export default function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
    const today = format(new Date(), 'yyyy-MM-dd');

    const presets = [
        { label: 'Today', start: today, end: today },
        { label: '7 Days', start: format(subDays(new Date(), 6), 'yyyy-MM-dd'), end: today },
        { label: '30 Days', start: format(subDays(new Date(), 29), 'yyyy-MM-dd'), end: today },
        {
            label: 'This Month',
            start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
            end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        },
    ];

    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => onChange(e.target.value, endDate)}
                    className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
                <span className="text-slate-500 text-sm">to</span>
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => onChange(startDate, e.target.value)}
                    className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
            </div>
            <div className="flex gap-1.5">
                {presets.map((preset) => (
                    <button
                        key={preset.label}
                        onClick={() => onChange(preset.start, preset.end)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                            startDate === preset.start && endDate === preset.end
                                ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                                : 'text-slate-400 bg-slate-800/50 hover:bg-slate-800 hover:text-white'
                        }`}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
