/**
 * Shared CRM constants (Feature 13 — customer feedback log).
 *
 * Option lists and label maps used by the guided call screen, the
 * feedback list, the customer-detail Feedback tab and the worklist.
 */

export interface Option {
    value: string;
    label: string;
}

// The five call outcomes the form offers. (Historic "Inactive" rows from
// the import are folded into `discontinued` — see import-feedback.js.)
export const FEEDBACK_STATUS_OPTIONS: Option[] = [
    { value: 'done', label: 'Done' },
    { value: 'no_response', label: 'No Response' },
    { value: 'call_later', label: 'Call Later' },
    { value: 'discontinued', label: 'Discontinued' },
    { value: 'invalid_number', label: 'Invalid Number' },
];

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
    FEEDBACK_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export const STATUS_BADGE_CLASS: Record<string, string> = {
    done: 'bg-green-500/20 text-green-400',
    no_response: 'bg-yellow-500/20 text-yellow-400',
    call_later: 'bg-blue-500/20 text-blue-400',
    discontinued: 'bg-red-500/20 text-red-400',
    invalid_number: 'bg-slate-600/30 text-slate-400',
};

export const CALL_TYPE_OPTIONS: Option[] = [
    { value: 'feedback', label: 'Feedback Call' },
    { value: 'reactivation', label: 'Reactivation Call' },
];

export const CALL_TYPE_LABELS: Record<string, string> = Object.fromEntries(
    CALL_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

// Observed values from the source sheet, plus a couple of obvious extras.
export const RING_BELL_OPTIONS = ['Ring Bell', 'Knock Door', 'Call', 'Message', 'NA'];
export const DROP_PLACE_OPTIONS = ['Basket', 'Bag', 'Shoe Rack', 'Cupboard', 'Doorstep', 'NA'];

export const ACTIVITY_WINDOW_KEYS = ['7', '15', '30', '60', '90', '180'];

export function statusLabel(status: string | null | undefined): string {
    if (!status) return '-';
    return STATUS_LABELS[status] || status;
}

export function callTypeLabel(callType: string | null | undefined): string {
    if (!callType) return '-';
    return CALL_TYPE_LABELS[callType] || callType;
}
