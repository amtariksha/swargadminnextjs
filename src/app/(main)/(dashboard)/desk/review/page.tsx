'use client';

import { useState } from 'react';
import { CarryOverBlock } from '@/components/desk/review/CarryOverBlock';
import { ClustersBlock } from '@/components/desk/review/ClustersBlock';
import { ComplaintsBlock } from '@/components/desk/review/ComplaintsBlock';
import { HealthBlock } from '@/components/desk/review/HealthBlock';
import { MoneyBlock } from '@/components/desk/review/MoneyBlock';
import { SalesBlock } from '@/components/desk/review/SalesBlock';
import { SampleBlock } from '@/components/desk/review/SampleBlock';
import { DeskErrorPanel } from '@/components/desk/reports/DeskErrorPanel';
import { formatIstWindow } from '@/components/desk/reports/format';
import { useDeskReview } from '@/hooks/useDeskReports';
import { istToday } from '@/lib/desk/business-hours';

export default function DeskReviewPage() {
    const [today] = useState(() => istToday(new Date()));
    const [date, setDate] = useState(today);
    const query = useDeskReview(date);
    const envelope = query.data;
    const review = envelope?.ok ? envelope.data : undefined;

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Morning review</h1>
                    <p className="text-slate-400">
                        {review ? `Window: ${formatIstWindow(review.window.from, review.window.to)} IST` : 'Yesterday and this morning so far.'}
                    </p>
                </div>
                <input
                    type="date"
                    value={date}
                    max={today}
                    onChange={(event) => { if (event.target.value !== '') setDate(event.target.value); }}
                    aria-label="Review date"
                    className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-white"
                />
            </div>

            {review?.window.truncated ? (
                <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-300">
                    Too many tickets to show them all. Some lists are cut short.
                </p>
            ) : null}

            {envelope && !envelope.ok ? (
                <DeskErrorPanel code={envelope.error.code} onRetry={() => { void query.refetch(); }} />
            ) : review ? (
                <>
                    <CarryOverBlock data={review.carry_over} />
                    <ComplaintsBlock groups={review.complaints} />
                    <ClustersBlock clusters={review.clusters} />
                    <MoneyBlock rows={review.money} />
                    <SalesBlock sales={review.sales} />
                    <SampleBlock tickets={review.sample} />
                    <HealthBlock health={review.health} />
                </>
            ) : (
                <div className="h-64 animate-pulse rounded-2xl bg-slate-800/40" />
            )}
        </div>
    );
}
