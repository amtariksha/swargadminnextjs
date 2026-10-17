import type { ReactNode } from 'react';

/** An inline state card shown in place of a page. It never navigates anywhere by itself. */
export function DeskNotice({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 text-center">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {children ? <div className="mt-3 space-y-3 text-sm text-slate-300">{children}</div> : null}
        </div>
    );
}
