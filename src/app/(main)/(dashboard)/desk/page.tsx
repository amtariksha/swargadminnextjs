import { Suspense } from 'react';
import { DeskWorkspace } from '@/components/desk/DeskWorkspace';

// useSearchParams in DeskWorkspace needs a Suspense boundary above it.
export default function DeskPage() {
    return (
        <Suspense fallback={<div className="py-12 text-center text-sm text-slate-400">Loading…</div>}>
            <DeskWorkspace />
        </Suspense>
    );
}
