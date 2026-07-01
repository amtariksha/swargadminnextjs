'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Reusable from/to date-range control with prev/next-month arrows.
 *
 * The arrows jump to the previous / next whole calendar month (anchored on the
 * current `from` value); the two date inputs allow an arbitrary custom range;
 * "This month" resets to the current calendar month. Controlled — the parent
 * owns `{from, to}` (both YYYY-MM-DD) and re-queries on change.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function monthBounds(year: number, month: number): { from: string; to: string } {
  // month is 0-indexed; JS normalises overflow/underflow (e.g. month -1, 12).
  return {
    from: iso(new Date(Date.UTC(year, month, 1))),
    to: iso(new Date(Date.UTC(year, month + 1, 0))),
  };
}

export function currentMonthRange(): { from: string; to: string } {
  const n = new Date();
  return monthBounds(n.getFullYear(), n.getMonth());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

const dateCls =
  'px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';
const arrowCls =
  'p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-300 hover:bg-slate-700/50 disabled:opacity-40';

export default function MonthRangePicker({ from, to, onChange, className = '' }: MonthRangePickerProps) {
  const anchor = from ? new Date(`${from}T00:00:00Z`) : new Date();
  const step = (delta: number) => {
    const b = monthBounds(anchor.getUTCFullYear(), anchor.getUTCMonth() + delta);
    onChange(b.from, b.to);
  };

  // Show the month name only when the range is exactly one calendar month.
  const cur = monthBounds(anchor.getUTCFullYear(), anchor.getUTCMonth());
  const label =
    from === cur.from && to === cur.to
      ? `${MONTHS[anchor.getUTCMonth()]} ${anchor.getUTCFullYear()}`
      : null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button type="button" onClick={() => step(-1)} className={arrowCls} title="Previous month" aria-label="Previous month">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <input type="date" value={from} onChange={(e) => onChange(e.target.value, to)} className={dateCls} aria-label="From date" />
      <span className="text-slate-500 text-sm">to</span>
      <input type="date" value={to} onChange={(e) => onChange(from, e.target.value)} className={dateCls} aria-label="To date" />
      <button type="button" onClick={() => step(1)} className={arrowCls} title="Next month" aria-label="Next month">
        <ChevronRight className="w-4 h-4" />
      </button>
      {label && <span className="text-sm text-slate-400 ml-1">{label}</span>}
      <button
        type="button"
        onClick={() => { const c = currentMonthRange(); onChange(c.from, c.to); }}
        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-300 text-xs hover:bg-slate-700/50"
      >
        This month
      </button>
    </div>
  );
}
