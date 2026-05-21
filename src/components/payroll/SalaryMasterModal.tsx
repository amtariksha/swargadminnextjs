'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/Modal';
import { inputClassName } from '@/components/FormField';
import { useSalaryMaster, useSaveSalaryMaster, type SalaryMaster } from '@/hooks/useData';
import { ApiError } from '@/lib/api-error';

interface SalaryMasterModalProps {
    driverId: number;
    driverName: string;
    onClose: () => void;
    onSaved?: () => void;
}

interface FieldDef {
    key: keyof SalaryMaster;
    label: string;
    type: 'text' | 'number' | 'date';
}

const PROFILE: FieldDef[] = [
    { key: 'designation', label: 'Designation', type: 'text' },
    { key: 'joining_date', label: 'Joining Date', type: 'date' },
];
const BANK: FieldDef[] = [
    { key: 'bank_name', label: 'Bank Name', type: 'text' },
    { key: 'account_holder_name', label: 'Account Holder Name', type: 'text' },
    { key: 'account_no', label: 'Account No', type: 'text' },
    { key: 'ifsc', label: 'IFSC', type: 'text' },
    { key: 'pan', label: 'PAN', type: 'text' },
    { key: 'uan', label: 'UAN', type: 'text' },
];
const EARNINGS: FieldDef[] = [
    { key: 'basic', label: 'Basic', type: 'number' },
    { key: 'hra', label: 'HRA', type: 'number' },
    { key: 'medical_allowance', label: 'Medical Allowance', type: 'number' },
    { key: 'special_allowance', label: 'Special Allowance', type: 'number' },
    { key: 'travel_allowance', label: 'Travel Allowance', type: 'number' },
    { key: 'reimbursement_base', label: 'Reimbursement', type: 'number' },
    { key: 'bonus_base', label: 'Bonus', type: 'number' },
];
const DEDUCTIONS: FieldDef[] = [
    { key: 'pf_deduction', label: 'Provident Fund', type: 'number' },
    { key: 'esi_deduction', label: 'ESI', type: 'number' },
    { key: 'pt_deduction', label: 'Professional Tax', type: 'number' },
    { key: 'tax_deduction', label: 'Income Tax (TDS)', type: 'number' },
    { key: 'misc_deduction', label: 'Misc Deduction', type: 'number' },
];
const ALL_FIELDS = [...PROFILE, ...BANK, ...EARNINGS, ...DEDUCTIONS];

/** Feature 15 — Edit Master: the fixed monthly salary contract for a driver. */
export default function SalaryMasterModal({ driverId, driverName, onClose, onSaved }: SalaryMasterModalProps) {
    const { data: master, isLoading } = useSalaryMaster(driverId);
    const saveMaster = useSaveSalaryMaster();

    const [form, setForm] = useState<Record<string, string>>({});
    const [isActive, setIsActive] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (master) {
            const next: Record<string, string> = {};
            for (const f of ALL_FIELDS) {
                const v = master[f.key];
                next[f.key] = v == null ? '' : String(v);
            }
            setForm(next);
            setIsActive(master.is_active !== 0);
        }
    }, [master]);

    const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

    const handleSave = async () => {
        setErrorMsg('');
        try {
            await saveMaster.mutateAsync({ driver_id: driverId, ...form, is_active: isActive ? 1 : 0 });
            toast.success('Salary master saved');
            onSaved?.();
            onClose();
        } catch (err) {
            const msg = err instanceof ApiError ? err.userMessage
                : err instanceof Error ? err.message : 'Failed to save salary master';
            setErrorMsg(msg);
            toast.error(msg);
        }
    };

    const renderFields = (defs: FieldDef[]) => (
        <div className="grid grid-cols-2 gap-3">
            {defs.map((f) => (
                <div key={f.key}>
                    <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                    <input
                        type={f.type}
                        value={form[f.key] ?? ''}
                        onChange={(e) => set(f.key, e.target.value)}
                        className={inputClassName}
                        {...(f.type === 'number' ? { min: 0, step: '0.01' } : {})}
                    />
                </div>
            ))}
        </div>
    );

    return (
        <Modal isOpen onClose={onClose} title={`Salary Master — ${driverName}`} size="xl">
            <div className="max-h-[70vh] overflow-y-auto space-y-5 pr-1">
                {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
                <Section title="Profile">{renderFields(PROFILE)}</Section>
                <Section title="Bank Details">{renderFields(BANK)}</Section>
                <Section title="Earnings (monthly)">{renderFields(EARNINGS)}</Section>
                <Section title="Standard Deductions (monthly)">{renderFields(DEDUCTIONS)}</Section>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="w-4 h-4 rounded accent-purple-500" />
                    Active — inactive masters are skipped by Generate Payslips
                </label>
                {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
            </div>
            <div className="flex gap-3 pt-4 mt-1 border-t border-slate-800/50">
                <button onClick={onClose}
                    className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">
                    Cancel
                </button>
                <button onClick={handleSave} disabled={saveMaster.isPending}
                    className="flex-1 px-4 py-2.5 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-xl disabled:opacity-50">
                    {saveMaster.isPending ? 'Saving…' : 'Save Master'}
                </button>
            </div>
        </Modal>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div>
            <h4 className="text-sm font-semibold text-white mb-2">{title}</h4>
            {children}
        </div>
    );
}
