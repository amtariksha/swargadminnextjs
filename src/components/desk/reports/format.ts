// Display helpers of the Desk reports. Pure. Instants are shown in IST with an explicit time zone,
// never in the browser's, and dates are never re-parsed from a local time.

const SECS_PER_MINUTE = 60;
const SECS_PER_HOUR = 3600;
const SECS_PER_DAY = 86_400;
const NOT_AVAILABLE = '—';

export function formatDuration(secs: number | null): string {
    if (secs === null) return NOT_AVAILABLE;
    if (secs < SECS_PER_MINUTE) return `${secs}s`;
    if (secs < SECS_PER_HOUR) return `${Math.floor(secs / SECS_PER_MINUTE)}m`;
    const minutes = Math.floor((secs % SECS_PER_HOUR) / SECS_PER_MINUTE);
    if (secs < SECS_PER_DAY) return `${Math.floor(secs / SECS_PER_HOUR)}h ${minutes}m`;
    return `${Math.floor(secs / SECS_PER_DAY)}d ${Math.floor((secs % SECS_PER_DAY) / SECS_PER_HOUR)}h`;
}

/** A fraction 0-1 as a percentage with at most one decimal. */
export function formatRate(value: number | null): string {
    return value === null ? NOT_AVAILABLE : `${Number((value * 100).toFixed(1))}%`;
}

/** A percentage already on a 0-100 scale. */
export function formatPct(value: number | null): string {
    return value === null ? NOT_AVAILABLE : `${Number(value.toFixed(1))}%`;
}

/** 'product_quality' becomes 'Product quality'; null is "Not recorded". */
export function humanise(value: string | null): string {
    if (value === null || value === '') return 'Not recorded';
    const spaced = value.replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const IST_PARTS = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** '12 Oct 10:00' for an instant, in IST. An unreadable instant is shown as a dash. */
export function formatIst(instant: string | null): string {
    if (instant === null || Number.isNaN(Date.parse(instant))) return NOT_AVAILABLE;
    const parts = Object.fromEntries(IST_PARTS.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    return `${parts.day} ${parts.month} ${parts.hour}:${parts.minute}`;
}

/** '12 Oct 00:00 – 14 Oct 10:00' */
export function formatIstWindow(from: string, to: string): string {
    return `${formatIst(from)} – ${formatIst(to)}`;
}

/** 'YYYY-MM-DD' as '12 Oct' without going through a local time zone. */
export function formatIstDay(date: string): string {
    const [, month, day] = date.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${Number(day)} ${names[Number(month) - 1] ?? month}`;
}

const MS_PER_DAY = 86_400_000;

/** One line for a date range the stats route would refuse, or null when it is fine. */
export function rangeProblem(from: string, to: string, maxDays: number): string | null {
    if (from === '' || to === '') return 'Choose a start and an end date.';
    if (to < from) return 'The end date is before the start date.';
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY + 1;
    return days > maxDays ? `Choose at most ${maxDays} days.` : null;
}
