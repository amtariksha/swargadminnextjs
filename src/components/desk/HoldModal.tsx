'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Modal from '@/components/Modal';
import { dateInputClassName, selectClassName, textareaClassName, timeInputClassName } from '@/components/FormField';
import { EXEC_HOLD_REASONS, NEXT_MORNING_FOLLOW_UP_HHMM } from '@/lib/desk/constants';
import { DeskClientError, deskKeys } from '@/lib/desk/desk-query';
import { istIsoAfter, istIsoAt, nextIstClockIso } from '@/lib/desk/ticket-format';
import { HOLD_REASON_LABEL, deskErrorText } from '@/lib/desk/ticket-labels';
import { useTicketPatch } from '@/lib/desk/ticket-mutations';

type ExecHoldReason = (typeof EXEC_HOLD_REASONS)[number];
type FollowUpChoice = 'two_hours' | 'next_morning' | 'pick';
const CHOICES: readonly { value: FollowUpChoice; label: string }[] = [
    { value: 'two_hours', label: 'In 2 hours' },
    { value: 'next_morning', label: `Next ${NEXT_MORNING_FOLLOW_UP_HHMM}` },
    { value: 'pick', label: 'Pick a time' },
];

interface HoldModalProps {
    ticketId: string;
    onClose: () => void;
}

/** Date.now() is read only inside the submit handler, never during render. */
function followUpFor(choice: FollowUpChoice | null, date: string, time: string, nowMs: number): string {
    if (choice === 'two_hours') return istIsoAfter(nowMs, 120);
    if (choice === 'next_morning') return nextIstClockIso(nowMs, NEXT_MORNING_FOLLOW_UP_HHMM);
    return choice === 'pick' && date !== '' && time !== '' ? istIsoAt(date, time) : '';
}

export function HoldModal({ ticketId, onClose }: HoldModalProps) {
    const queryClient = useQueryClient();
    const patch = useTicketPatch(ticketId);
    const [reason, setReason] = useState<ExecHoldReason | ''>('');
    const [choice, setChoice] = useState<FollowUpChoice | null>(null);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);

    const submit = () => {
        const nowMs = Date.now();
        const followUpAt = followUpFor(choice, date, time, nowMs);
        if (reason === '') return setError('Choose a reason.');
        if (followUpAt === '' || !(Date.parse(followUpAt) > nowMs)) return setError(deskErrorText('follow_up_required', ''));
        if (reason === 'other' && note.trim() === '') return setError(deskErrorText('note_required', ''));
        setError(null);
        patch.mutate(
            {
                op: 'hold', hold_reason: reason, follow_up_at: followUpAt,
                ...(note.trim() !== '' ? { note: note.trim() } : {}),
            },
            {
                onSuccess: onClose,
                onError: (failure) => {
                    const code = failure instanceof DeskClientError ? failure.code : 'internal_error';
                    if (code === 'ticket_resolved') {
                        toast.error(deskErrorText(code, failure.message));
                        void queryClient.invalidateQueries({ queryKey: deskKeys.ticket(ticketId) });
                        onClose();
                    } else {
                        setError(deskErrorText(code, failure.message));
                    }
                },
            },
        );
    };

    return (
        <Modal isOpen onClose={onClose} title="Put on hold">
            <div className="space-y-3">
                <select value={reason} onChange={(e) => setReason(EXEC_HOLD_REASONS.find((value) => value === e.target.value) ?? '')} className={selectClassName}>
                    <option value="" disabled>Reason…</option>
                    {EXEC_HOLD_REASONS.map((value) => <option key={value} value={value}>{HOLD_REASON_LABEL[value]}</option>)}
                </select>
                <div className="flex flex-wrap gap-3 text-sm text-slate-200">
                    {CHOICES.map((option) => (
                        <label key={option.value} className="flex items-center gap-1.5">
                            <input type="radio" name="follow-up" checked={choice === option.value} onChange={() => setChoice(option.value)} />
                            {option.label}
                        </label>
                    ))}
                </div>
                {choice === 'pick' ? (
                    <div className="flex gap-2">
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={dateInputClassName} />
                        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={timeInputClassName} />
                        <span className="self-center text-xs text-slate-500">IST</span>
                    </div>
                ) : null}
                <textarea
                    value={note}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={reason === 'other' ? 'Note (required)' : 'Note (optional)'}
                    className={textareaClassName}
                />
                {error !== null ? <p className="text-sm text-red-400">{error}</p> : null}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">Cancel</button>
                    <button
                        type="button"
                        disabled={patch.isPending}
                        onClick={submit}
                        className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
                    >
                        {patch.isPending ? 'Saving…' : 'Put on hold'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
