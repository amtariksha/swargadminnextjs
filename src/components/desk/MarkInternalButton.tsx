'use client';

// The "Mark number" dialog (unit P1e). The file name is fixed by the ownership table; the component is
// the dialog the "Mark number as internal…" menu entry opens. Callers mount it only while it is open
// (so its fields start fresh) and only for a manager: route 22 refuses everyone else.

import { useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/Modal';
import { inputClassName, selectClassName } from '@/components/FormField';
import { CONTACT_FLAG_KINDS, type ContactFlagKind } from '@/lib/desk/constants';
import { useCreateContactFlag } from '@/lib/desk/contact-flag-hooks';
import { DeskClientError } from '@/lib/desk/desk-query';
import { deskErrorText } from '@/lib/desk/ticket-labels';

const KIND_LABEL: Record<ContactFlagKind, string> = {
    internal: 'Internal — staff, vendor, family: never open a ticket',
    customer: 'Customer — open tickets even if this number is staff',
};

interface MarkInternalButtonProps {
    onClose: () => void;
    /** Any format; the server stores the 10-digit form. */
    initialPhone?: string | null;
    initialLabel?: string | null;
}

export function MarkInternalButton({ onClose, initialPhone, initialLabel }: MarkInternalButtonProps) {
    const create = useCreateContactFlag();
    const [phone, setPhone] = useState(initialPhone ?? '');
    const [kind, setKind] = useState<ContactFlagKind>('internal');
    const [label, setLabel] = useState(initialLabel ?? '');
    const [error, setError] = useState<string | null>(null);

    const submit = () => {
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 10) return setError('Enter the full phone number.');
        setError(null);
        create.mutate(
            { phone: digits, kind, ...(label.trim() !== '' ? { label: label.trim().slice(0, 80) } : {}) },
            {
                onSuccess: () => {
                    toast.success(kind === 'internal'
                        ? 'Marked as internal. Its open tickets close within a minute.'
                        : 'Marked as a customer. New messages open tickets again.');
                    onClose();
                },
                onError: (failure) => {
                    const code = failure instanceof DeskClientError ? failure.code : 'internal_error';
                    setError(code === 'validation_failed' ? failure.message : deskErrorText(code, failure.message));
                },
            },
        );
    };

    return (
        <Modal isOpen onClose={onClose} title="Mark number" size="sm">
            <div className="space-y-3">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Phone number" className={inputClassName} />
                <select value={kind} onChange={(e) => setKind(CONTACT_FLAG_KINDS.find((value) => value === e.target.value) ?? 'internal')} className={selectClassName}>
                    {CONTACT_FLAG_KINDS.map((value) => <option key={value} value={value}>{KIND_LABEL[value]}</option>)}
                </select>
                <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Who is this? (optional)" className={inputClassName} />
                {error !== null ? <p className="text-sm text-red-400">{error}</p> : null}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">Cancel</button>
                    <button
                        type="button"
                        disabled={create.isPending}
                        onClick={submit}
                        className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
                    >
                        {create.isPending ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
