'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/Modal';
import { inputClassName } from '@/components/FormField';
import { useUpdatePayslip, type PayslipRow } from '@/hooks/useData';
import { ApiError } from '@/lib/api-error';

interface EditPayslipModalProps {
    payslip: PayslipRow;
    onClose: () => void;
    onSaved?: () => void;
}

interface FieldDef {
    key: keyof PayslipRow;
    label: string;
    group: 'earning' | 'deduction';
}

const FIELDS: FieldDef[] = [
    { key: 'basic_paid', label: 'Basic', group: 'earning' },
    { key: 'hra_paid', label: 'HRA', group: 'earning' },
    { key: 'medical_allowance', label: 'Medical Allowance', group: 'earning' },
    { key: 'special_allowance', label: 'Special Allowance', group: 'earning' },
    { key: 'travel_allowance', label: 'Travel Allowance', group: 'earning' },
    { key: 'bonus', label: 'Bonus', group: 'earning' },
    { key: 'reimbursement', label: 'Reimbursement', group: 'earning' },
    { key: 'pf', label: 'Provident Fund', group: 'deduction' },
    { key: 'esi', label: 'ESI', group: 'deduction' },
    { key: 'pt', label: 'Professional Tax', group: 'deduction' },
    { key: 'tax', label: 'Income Tax (TDS)', group: 'deduction' },
    { key: 'misc', label: 'Misc Deduction', group: 'deduction' },
];

const num = (v: string | number | null | undefined) => Number(v) || 0;

/** Feature 15 — Edit Current: adjust one payslip's monthly components.
 *  Saving marks the payslip a draft; re-generate refreshes the PDF. */
export default function EditPayslipModal({ payslip, onClose, onSaved }: EditPayslipModalProps) {
    const updatePayslip = useUpdatePayslip();
    const [form, setForm] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {};
        for (const f of FIELDS) init[f.key] = String(num(payslip[f.key] as number | null));
        return init;
    });
    const [errorMsg, setErrorMsg] = useState('');

    const billed = num(payslip.billed_deductions);
    const totalEarning = FIELDS.filter((f) => f.group === 'earning')
        .reduce((s, f) => s + num(form[f.key]), 0);
    const totalDeduction = FIELDS.filter((f) => f.group === 'deduction')
        .reduce((s, f) => s + num(form[f.key]), 0) + billed;
    const netPay = totalEarning - totalDeduction;

    const handleSave = async () => {
        setErrorMsg('');
        if (!payslip.payslip_id) return;
        try {
            const payload: Record<string, number> = {};
            for (const f of FIELDS) payload[f.key] = num(form[f.key]);
            await updatePayslip.mutateAsync({ id: payslip.payslip_id, ...payload });
            toast.success('Payslip updated — re-generate to refresh the PDF');
            onSaved?.();
            onClose();
        } catch (err) {
            const msg = err instanceof ApiError ? err.userMessage
                : err instanceof Error ? err.message : 'Failed to update payslip';
            setErrorMsg(msg);
            toast.error(msg);
        }
    };

    const fieldGrid = (group: 'earning' | 'deduction') => (
        <div className="grid grid-cols-2 gap-3">
            {FIELDS.filter((f) => f.group === group).map((f) => (
                <div key={f.key}>
                    <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                    <input type="number" min={0} step="0.01" value={form[f.key]}
                        onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                        className={inputClassName} />
                </div>
            ))}
        </div>
    );

    return (
        <Modal isOpen onClose={onClose} title={`Edit Payslip — ${payslip.driver_name}`} size="lg">
            <div className="max-h-[70vh] overflow-y-auto space-y-5 pr-1">
                <div>
                    <h4 className="text-sm font-semibold text-white mb-2">Earnings</h4>
                    {fieldGrid('earning')}
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-white mb-2">Standard Deductions</h4>
                    {fieldGrid('deduction')}
                </div>
                <p className="text-xs text-slate-500">
                    Billed deductions (Rs. {billed.toFixed(2)}) are system-summed from refund billings
                    &amp; ad-hoc deductions and are not editable here.
                </p>
                <div className="grid grid-cols-3 gap-3">
                    <Stat label="Total Earning" value={totalEarning} />
                    <Stat label="Total Deduction" value={totalDeduction} />
                    <Stat label="Net Pay" value={netPay} highlight />
                </div>
                {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
            </div>
            <div className="flex gap-3 pt-4 border-t border-slate-800/50">
                <button onClick={onClose}
                    className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">
                    Cancel
                </button>
                <button onClick={handleSave} disabled={updatePayslip.isPending}
                    className="flex-1 px-4 py-2.5 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-xl disabled:opacity-50">
                    {updatePayslip.isPending ? 'Saving…' : 'Save Changes'}
                </button>
            </div>
        </Modal>
    );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
    const color = highlight ? (value < 0 ? 'text-red-400' : 'text-green-400') : 'text-white';
    return (
        <div className="bg-slate-900/50 rounded-xl p-3">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`font-bold ${color}`}>Rs. {value.toFixed(2)}</p>
        </div>
    );
}
