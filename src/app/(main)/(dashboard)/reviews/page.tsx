'use client';

/**
 * Admin review moderation queue (Phase H).
 *
 *   /reviews
 *
 * Tabs by status (pending / approved / rejected / archived). Default
 * lands on Pending — FIFO order so the oldest unmoderated submission is
 * at the top. Each row exposes Approve / Reject / Archive + an inline
 * Respond textarea so the operator can leave a public reply.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Archive as ArchiveIcon, MessageSquare, Star as StarIcon } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAdminReviews, useUpdateReview } from '@/hooks/useReviews';
import type { Review, ReviewStatus } from '@/lib/types/reviews';
import { ApiError } from '@/lib/api';

const STATUS_TABS: { value: ReviewStatus; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'archived', label: 'Archived' },
];

export default function ReviewsPage() {
    const [status, setStatus] = useState<ReviewStatus>('pending');
    const [respondingTo, setRespondingTo] = useState<Review | null>(null);
    const [responseText, setResponseText] = useState('');
    const [confirmArchive, setConfirmArchive] = useState<Review | null>(null);

    const { data, isLoading } = useAdminReviews({ status, limit: 100 });
    const reviews = data?.data ?? [];
    const total = data?.meta?.total ?? 0;
    const updateMut = useUpdateReview();

    const setStatusFor = async (review: Review, next: ReviewStatus) => {
        try {
            await updateMut.mutateAsync({ id: review.id, status: next });
            toast.success(`Review marked ${next}`);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Update failed');
        }
    };

    const submitResponse = async () => {
        if (!respondingTo) return;
        try {
            await updateMut.mutateAsync({
                id: respondingTo.id,
                admin_response: responseText.trim() || null,
            });
            toast.success('Response saved');
            setRespondingTo(null);
            setResponseText('');
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Save failed');
        }
    };

    const onArchive = async () => {
        if (!confirmArchive) return;
        await setStatusFor(confirmArchive, 'archived');
        setConfirmArchive(null);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Reviews</h1>
                <p className="text-slate-400 text-sm">
                    Moderate customer reviews — approve to publish on the storefront,
                    reject to hide, archive for soft-delete.
                </p>
            </div>

            {/* Status tabs */}
            <div className="flex items-center gap-1 border-b border-slate-800/50">
                {STATUS_TABS.map((t) => (
                    <button key={t.value}
                        onClick={() => setStatus(t.value)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            status === t.value
                                ? 'text-purple-300 border-purple-500'
                                : 'text-slate-400 border-transparent hover:text-slate-200'
                        }`}>
                        {t.label}
                        {status === t.value && <span className="ml-2 text-xs text-slate-500">({total})</span>}
                    </button>
                ))}
            </div>

            {/* Queue */}
            {isLoading ? (
                <div className="text-slate-500 p-6 text-sm">Loading…</div>
            ) : reviews.length === 0 ? (
                <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
                    No {status} reviews.
                </div>
            ) : (
                <ul className="space-y-3">
                    {reviews.map((r) => (
                        <li key={r.id} className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-4">
                            <div className="flex items-start justify-between gap-4 mb-2">
                                <div className="flex items-center gap-2">
                                    <StarsRow value={r.rating} />
                                    <span className="text-white font-medium">{r.title || '—'}</span>
                                    {r.verified_purchase === 1 && (
                                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                            Verified buyer
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    {r.status !== 'approved' && (
                                        <button onClick={() => setStatusFor(r, 'approved')} title="Approve"
                                            className="p-1.5 hover:bg-emerald-500/20 rounded">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        </button>
                                    )}
                                    {r.status !== 'rejected' && (
                                        <button onClick={() => setStatusFor(r, 'rejected')} title="Reject"
                                            className="p-1.5 hover:bg-red-500/20 rounded">
                                            <XCircle className="w-4 h-4 text-red-400" />
                                        </button>
                                    )}
                                    <button onClick={() => { setRespondingTo(r); setResponseText(r.admin_response || ''); }}
                                        title="Respond"
                                        className="p-1.5 hover:bg-purple-500/20 rounded">
                                        <MessageSquare className="w-4 h-4 text-purple-300" />
                                    </button>
                                    <button onClick={() => setConfirmArchive(r)} title="Archive"
                                        className="p-1.5 hover:bg-slate-700/50 rounded">
                                        <ArchiveIcon className="w-4 h-4 text-slate-400" />
                                    </button>
                                </div>
                            </div>
                            {r.body && (
                                <p className="text-sm text-slate-300 whitespace-pre-line mb-2">{r.body}</p>
                            )}
                            <div className="text-xs text-slate-500">
                                {r.user_name || 'Anonymous'}
                                {r.user_phone && <span> · {r.user_phone}</span>}
                                <span> · {r.product_title || `product #${r.product_id}`}</span>
                                {r.variant_slug && <span> / {r.variant_slug}</span>}
                                <span> · {r.created_at?.slice(0, 19) || ''}</span>
                            </div>
                            {r.admin_response && (
                                <div className="mt-2 pl-3 border-l-2 border-purple-500/40 bg-purple-500/5 py-1.5 px-2 rounded">
                                    <p className="text-[10px] uppercase tracking-wide text-purple-300 mb-0.5">Store response</p>
                                    <p className="text-sm text-slate-200 whitespace-pre-line">{r.admin_response}</p>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {/* Respond modal */}
            {respondingTo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    onClick={() => setRespondingTo(null)}>
                    <div className="bg-slate-900 rounded-xl border border-slate-800/50 w-full max-w-md p-5"
                        onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-white mb-2">Respond to review</h3>
                        <p className="text-xs text-slate-500 mb-3">
                            "{respondingTo.title || respondingTo.body?.slice(0, 60) || 'review'}"
                        </p>
                        <textarea rows={4} value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                            placeholder="Public reply shown under the review on the storefront"
                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                        <div className="flex justify-end gap-2 mt-3">
                            <button onClick={() => setRespondingTo(null)}
                                className="px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-lg text-sm">
                                Cancel
                            </button>
                            <button onClick={submitResponse} disabled={updateMut.isPending}
                                className="px-4 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm disabled:opacity-50">
                                {updateMut.isPending ? 'Saving…' : 'Save response'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={!!confirmArchive}
                title="Archive review"
                message={`Archive "${confirmArchive?.title || 'this review'}"? It will be hidden from the storefront but kept for audit.`}
                onConfirm={onArchive}
                onCancel={() => setConfirmArchive(null)}
                variant="danger"
                confirmText="Archive"
            />
        </div>
    );
}

function StarsRow({ value, max = 5 }: { value: number; max?: number }) {
    return (
        <span className="inline-flex items-center gap-0.5">
            {Array.from({ length: max }).map((_, i) => (
                <StarIcon key={i}
                    className={`w-4 h-4 ${i < value ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}`} />
            ))}
        </span>
    );
}
