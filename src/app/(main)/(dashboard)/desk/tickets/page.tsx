import { Suspense } from 'react';
import { TicketsPage } from '@/components/desk/TicketsPage';

// useSearchParams in TicketsPage needs a Suspense boundary above it.
export default function DeskTicketsPage() {
    return (
        <Suspense fallback={<div className="py-12 text-center text-sm text-slate-400">Loading…</div>}>
            <TicketsPage />
        </Suspense>
    );
}
