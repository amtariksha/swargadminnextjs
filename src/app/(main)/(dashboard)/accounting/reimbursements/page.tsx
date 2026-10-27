'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HandCoins } from 'lucide-react';
import Modal from '@/components/Modal';
import { POST } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/accounting';
import { useMoneyLedgers, useReimbursements, StaffReimbursement } from '@/hooks/useAccounting';

const inputCls =
    'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';
const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Staff reimbursements: what each staff member paid vendors from their own
 * pocket (Inventory → Vendor Payments → "Paid by staff"), what has been paid
 * back, and what is still owed. Paying back here posts Dr their ledger / Cr the
 * chosen cash or bank account — a bank transfer can instead be assigned to
 * their ledger in Bank reconciliation. Both reach Tally.
 */
export default function ReimbursementsPage() {
    const { data, isLoading } = useReimbursements();
    const [paying, setPaying] = useState<StaffReimbursement | null>(null);
    const staff = data?.staff || [];
    const movements = data?.movements || [];

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="max-w-2xl">
                    <h1 className="text-2xl font-bold text-white">Reimbursements</h1>
                    <p className="text-slate-400">
                        Staff who paid a vendor from their own pocket. Record those in Inventory → Vendor Payments with
                        &ldquo;Paid by staff&rdquo;; pay them back here, or assign the bank transfer to their ledger in
                        Bank reconciliation.
                    </p>
                </div>
                <div className="glass rounded-2xl px-5 py-3 text-right">
                    <div className="text-xs text-slate-400">Owed to staff</div>
                    <div className="text-xl font-semibold text-amber-300">{formatINR(data?.total_owed ?? 0)}</div>
                </div>
            </div>

            <div className="glass rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-800/50 text-slate-400">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">Staff member</th>
                                <th className="text-right px-4 py-3 font-medium">Paid for us</th>
                                <th className="text-right px-4 py-3 font-medium">Paid back</th>
                                <th className="text-right px-4 py-3 font-medium">Owed</th>
                                <th className="text-left px-4 py-3 font-medium">Tally ledger</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/40">
                            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>}
                            {!isLoading && staff.length === 0 && (
                                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No staff has paid on the company&rsquo;s behalf yet.</td></tr>
                            )}
                            {staff.map((s) => (
                                <tr key={s.user_id}>
                                    <td className="px-4 py-3 text-white">{s.name || `#${s.user_id}`}</td>
                                    <td className="px-4 py-3 text-right text-slate-300">{formatINR(s.claimed)}</td>
                                    <td className="px-4 py-3 text-right text-slate-300">{formatINR(s.reimbursed)}</td>
                                    <td className={`px-4 py-3 text-right font-medium ${s.owed > 0 ? 'text-amber-300' : 'text-slate-400'}`}>{formatINR(s.owed)}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500">{s.tally_ledger_name || '—'}</td>
                                    <td className="px-4 py-3 text-right">
                                        {s.owed > 0 && (
                                            <button onClick={() => setPaying(s)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25">
                                                <HandCoins className="w-3.5 h-3.5" /> Pay back
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="glass rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-700/40 text-white font-medium">Recent movements</div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-800/50 text-slate-400">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">Date</th>
                                <th className="text-left px-4 py-3 font-medium">Voucher</th>
                                <th className="text-left px-4 py-3 font-medium">Staff</th>
                                <th className="text-left px-4 py-3 font-medium">Narration</th>
                                <th className="text-right px-4 py-3 font-medium">Paid for us</th>
                                <th className="text-right px-4 py-3 font-medium">Paid back</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/40">
                            {movements.length === 0 && (
                                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Nothing yet.</td></tr>
                            )}
                            {movements.map((m) => (
                                <tr key={`${m.voucher_id}-${m.user_id}`}>
                                    <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{formatDate(m.date)}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{m.voucher_number || `#${m.voucher_id}`}</td>
                                    <td className="px-4 py-2.5 text-white">{m.name || `#${m.user_id}`}</td>
                                    <td className="px-4 py-2.5 text-slate-400">{m.narration || '—'}</td>
                                    <td className="px-4 py-2.5 text-right text-slate-300">{m.claimed ? formatINR(m.claimed) : ''}</td>
                                    <td className="px-4 py-2.5 text-right text-emerald-300">{m.reimbursed ? formatINR(m.reimbursed) : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {paying && <PayBackModal staff={paying} onClose={() => setPaying(null)} />}
        </div>
    );
}

function PayBackModal({ staff, onClose }: { staff: StaffReimbursement; onClose: () => void }) {
    const queryClient = useQueryClient();
    const { data: ledgers = [] } = useMoneyLedgers();
    const [amount, setAmount] = useState(String(staff.owed));
    const [date, setDate] = useState(today());
    const [ledgerId, setLedgerId] = useState('');
    const [reference, setReference] = useState('');
    const [saving, setSaving] = useState(false);
    // One id per dialog: a double-click posts the payment once.
    const [requestId] = useState(() => crypto.randomUUID());

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ledgerId) { toast.error('Pick the account it was paid from'); return; }
        setSaving(true);
        try {
            await POST('/accounting/reimbursements/pay', {
                user_id: staff.user_id, amount: Number(amount), payment_date: date,
                bank_ledger_id: Number(ledgerId), reference: reference.trim() || null, request_id: requestId,
            });
            toast.success(`Paid back ${formatINR(amount)} to ${staff.name || 'staff'}`);
            queryClient.invalidateQueries({ queryKey: ['accounting', 'reimbursements'] });
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to record');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen onClose={onClose} title={`Pay back ${staff.name || 'staff'}`}>
            <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Amount *</label>
                        <input type="number" step="0.01" min="0.01" value={amount} required
                            onChange={(e) => setAmount(e.target.value)} className={inputCls} />
                        <p className="text-xs text-slate-500 mt-1">Owed: {formatINR(staff.owed)}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Date *</label>
                        <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} className={inputCls} />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Paid from *</label>
                    <select value={ledgerId} required onChange={(e) => setLedgerId(e.target.value)} className={inputCls}>
                        <option value="">Cash or bank account…</option>
                        {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Reference</label>
                    <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / note" className={inputCls} />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
                    <button type="submit" disabled={saving}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                        {saving ? 'Saving…' : 'Record payment'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
