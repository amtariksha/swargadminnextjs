import type { DeskErrorCode } from '@/lib/desk/contracts';

const MESSAGES: Partial<Record<DeskErrorCode, string>> = {
    forbidden: 'This page needs the Desk manager permission.',
    ui_disabled: 'Desk is switched off.',
    not_installed: 'Desk is not installed yet.',
    unauthorized: 'Your session has expired. Sign in again.',
    authz_unavailable: 'Could not check your access. Try again in a minute.',
    range_too_large: 'Choose at most 92 days.',
};

/** Shows a failure envelope in place of a report. It never navigates anywhere. */
export function DeskErrorPanel({ code, onRetry }: { code: DeskErrorCode; onRetry?: () => void }) {
    const known = MESSAGES[code];
    return (
        <div role="alert" className="mx-auto mt-10 max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 text-center">
            <p className="text-white">{known ?? 'Could not load this page.'}</p>
            {known === undefined && onRetry ? (
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600"
                >
                    Retry
                </button>
            ) : null}
        </div>
    );
}
