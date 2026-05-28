'use client';

import Modal from '@/components/Modal';
import type { AudienceType } from './useAudienceCount';

interface BroadcastConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    submitting: boolean;

    title: string;
    body: string;
    scenario: string | null;
    audienceType: AudienceType;
    recipientCount: number | null;
}

/**
 * Last-chance preview before the broadcast goes out. Shows the resolved
 * title/body, the audience type + recipient count, and whether a
 * scenario tag is attached. The operator clicks Send → parent calls
 * POST /broadcast.
 */
export default function BroadcastConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    submitting,
    title,
    body,
    scenario,
    audienceType,
    recipientCount,
}: BroadcastConfirmModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Send this broadcast?" size="md">
            <div className="space-y-5">
                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                        Audience
                    </p>
                    <p className="text-white">
                        {audienceLabel(audienceType)}
                        {typeof recipientCount === 'number' && (
                            <span className="text-slate-400">
                                {' '}
                                — {recipientCount.toLocaleString()}{' '}
                                {recipientCount === 1 ? 'customer' : 'customers'}
                            </span>
                        )}
                    </p>
                </div>

                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                        Template
                    </p>
                    <p className="text-white">
                        {scenario ? (
                            <code className="text-purple-300">{scenario}</code>
                        ) : (
                            <span className="text-slate-400">Custom (no template)</span>
                        )}
                    </p>
                </div>

                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                        Title
                    </p>
                    <p className="text-white">{title}</p>
                </div>

                <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                        Message
                    </p>
                    <p className="text-white whitespace-pre-wrap">{body}</p>
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-slate-700/50">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={submitting}
                        className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium disabled:opacity-50"
                    >
                        {submitting ? 'Sending…' : 'Send broadcast'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function audienceLabel(t: AudienceType): string {
    switch (t) {
        case 'all':
            return 'All users';
        case 'custom':
            return 'Specific customers';
        case 'driver':
            return "Customers on one driver's route";
        default:
            return String(t);
    }
}
