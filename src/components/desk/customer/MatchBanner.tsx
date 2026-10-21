'use client';

import type { ReactNode } from 'react';
import type { DeskActionPlacement } from '@/lib/desk/action-context';
import { describeDeskError } from '@/lib/desk/desk-query';
import type { CustomerSnapshot, SnapshotCandidate, TicketView } from '@/lib/desk/types';

export interface MatchBannerProps {
    ticket: TicketView;
    snapshot: CustomerSnapshot;
    viewingId: number | null;
    matchError: Error | null;
    onPick: (userId: number) => void;
    slots: (placement: DeskActionPlacement) => ReactNode;
}

const BUTTON = 'rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50';

function Headline({ snapshot }: { snapshot: CustomerSnapshot }) {
    const { kind, candidates } = snapshot.match;
    const profile = snapshot.profile;
    if (kind === 'staff') {
        return <p className="text-amber-300">This number belongs to a staff account: {profile?.name ?? 'no name'}.</p>;
    }
    if (kind === 'candidates') {
        return <p className="text-slate-200">This number matches {candidates.length} accounts. Pick the right one.</p>;
    }
    if (kind === 'none' || profile === null) return <p className="text-slate-300">No customer account uses this number.</p>;
    return (
        <p className="flex flex-wrap items-center gap-2 font-medium text-white">
            <span>{profile.name ?? 'No name'} · account #{profile.user_id}{kind === 'alternate' ? ' · alternate phone' : ''}</span>
            {profile.is_b2b ? <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">B2B</span> : null}
        </p>
    );
}

function matchedOn(candidate: SnapshotCandidate): string {
    return `${candidate.matched_on === 'phone' ? 'same' : candidate.matched_on.replace('_phone', '')} phone`;
}

function CandidateRow({ candidate, viewing, onPick }: { candidate: SnapshotCandidate; viewing: boolean; onPick: (userId: number) => void }) {
    const address = [candidate.flat_no, candidate.apartment_name, candidate.area]
        .filter((part): part is string => part !== null && part.trim() !== '').join(', ');
    return (
        <div className="flex items-start justify-between gap-2 rounded-lg bg-slate-900/60 p-2">
            <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-slate-200">
                    <span>{candidate.name ?? 'No name'} · …{candidate.phone_tail}</span>
                    {candidate.is_staff ? <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">staff</span> : null}
                </p>
                <p className="text-xs text-slate-400">{address === '' ? 'No address' : address} · {matchedOn(candidate)}</p>
            </div>
            <button type="button" disabled={viewing} onClick={() => onPick(candidate.user_id)} className={BUTTON}>
                {viewing ? 'Viewing' : 'View'}
            </button>
        </div>
    );
}

export function MatchBanner({ ticket, snapshot, viewingId, matchError, onPick, slots }: MatchBannerProps) {
    const { kind, candidates } = snapshot.match;
    const profile = snapshot.profile;
    const linkedByHand = ticket.customer_match === 'manual' && ticket.backend_user_id !== null
        && profile !== null && ticket.backend_user_id !== profile.user_id;
    return (
        <section className="glass space-y-2 rounded-xl p-3 text-sm">
            <Headline snapshot={snapshot} />
            <p className="text-xs text-slate-500">Backend phone {snapshot.canonical_phone}</p>
            {kind === 'candidates' ? candidates.map((candidate) => (
                <CandidateRow key={candidate.user_id} candidate={candidate} viewing={viewingId === candidate.user_id} onPick={onPick} />
            )) : null}
            {viewingId !== null && profile !== null && viewingId !== ticket.backend_user_id ? (
                <p className="text-xs text-amber-300">Showing {profile.name ?? 'this account'}. This number is not linked to it.</p>
            ) : null}
            {linkedByHand ? <p className="text-xs text-amber-300">This ticket was linked by hand to account #{ticket.backend_user_id}.</p> : null}
            {matchError ? (
                <p className="text-xs text-slate-500">The match was not saved on the ticket: {describeDeskError(matchError).text}</p>
            ) : null}
            {kind === 'candidates' || kind === 'none' ? (
                <div className="flex flex-wrap gap-2 empty:hidden">{slots({ at: 'match' })}</div>
            ) : null}
        </section>
    );
}
