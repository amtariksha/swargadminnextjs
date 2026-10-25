'use client';

import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/Modal';
import { inputClassName, selectClassName, dateInputClassName } from '@/components/FormField';
import {
    useRefundReasons,
    useRefundOrderContext,
    useProcessRefund,
    useDrivers,
    type RefundResponseData,
    type UserTransaction,
} from '@/hooks/useData';
import { ApiError } from '@/lib/api-error';

/** What a successful refund hands to the caller (contract §2.4 row 1). */
export interface RefundResult {
    refundTxnId: number; debitTxnId: number; amount: number; refundReason: string;
    deliveryDate: string | null; billedToDriver: boolean; billedDriverId: number | null;
    driverDeductionAmount: number | null; orderId: number | null; newWalletBalance: number | null;
}

/** Never throws: a refund that succeeded must never be shown as failed. refundTxnId 0 = the id did not come back. */
export function toRefundResult(data: RefundResponseData | undefined, debitTxnId: number, reason: string): RefundResult {
    const txn = data?.transaction;
    return {
        refundTxnId: Number(txn?.id ?? 0) || 0,
        debitTxnId: txn?.refund_for_transaction_id ?? debitTxnId,
        amount: Number(txn?.amount ?? 0) || 0,
        refundReason: txn?.refund_reason ?? reason,
        deliveryDate: txn?.delivery_date ?? null,
        billedToDriver: data?.billed_to_driver === true,
        billedDriverId: data?.billed_driver_id ?? null,
        driverDeductionAmount: data?.driver_deduction_amount ?? null,
        orderId: txn?.order_id ?? null,
        newWalletBalance: data?.new_wallet_balance ?? null,
    };
}

interface RefundModalProps {
    /** The original debit transaction being refunded. */
    transaction: UserTransaction;
    onClose: () => void;
    /** Old screens pass a no-argument callback (or react-query's refetch); Desk reads the result. */
    onSuccess?: (() => void) | ((result: RefundResult) => void);
    /** Desk: the category's refund_reason_label; preselected only when it is one of the configured reasons. */
    defaultReason?: string;
    /** Desk: the driver from the customer snapshot; wins over the refund context's assigned driver. */
    defaultDriverId?: number;
}

const OTHER = '__other__';

/**
 * Feature 14 — shared refund popup used by the Transactions page and the
 * user-detail Transactions tab. Captures a reason, the delivery day, and an
 * optional "Bill delivery boy" path that records a driver deduction.
 */
export default function RefundModal({ transaction, onClose, onSuccess, defaultReason, defaultDriverId }: RefundModalProps) {
    const { data: context } = useRefundOrderContext(transaction.id);
    const { data: reasons = [] } = useRefundReasons(true);
    const { data: drivers = [] } = useDrivers();
    const processRefund = useProcessRefund();

    const [amount, setAmount] = useState(String(transaction.amount ?? ''));
    const [reasonSel, setReasonSel] = useState('');
    const [otherText, setOtherText] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');
    const [billDriver, setBillDriver] = useState(false);
    const [driverId, setDriverId] = useState(defaultDriverId !== undefined ? String(defaultDriverId) : '');
    const [deductionAmount, setDeductionAmount] = useState(String(transaction.amount ?? ''));
    const [errorMsg, setErrorMsg] = useState('');

    // Prefill delivery date + driver once the order context resolves.
    useEffect(() => {
        if (context?.delivery_date) setDeliveryDate(context.delivery_date);
    }, [context?.delivery_date]);
    useEffect(() => {
        if (defaultDriverId === undefined && context?.assigned_driver) setDriverId(String(context.assigned_driver.id));
    }, [context?.assigned_driver, defaultDriverId]);

    const driverOptions = useMemo(() => {
        const opts = new Map<number, string>();
        if (context?.assigned_driver) opts.set(context.assigned_driver.id, context.assigned_driver.name);
        for (const c of context?.driver_candidates ?? []) opts.set(c.id, c.name);
        for (const d of drivers) if (d.user_id) opts.set(d.user_id, d.name);
        if (defaultDriverId !== undefined && !opts.has(defaultDriverId)) opts.set(defaultDriverId, `Driver #${defaultDriverId}`);
        return Array.from(opts, ([id, name]) => ({ id, name }));
    }, [context, drivers, defaultDriverId]);

    const alreadyRefunded = context?.already_refunded ?? false;
    const notDebit = context ? !context.is_debit : false;
    const presetReason = defaultReason !== undefined && reasons.some((r) => r.label === defaultReason) ? defaultReason : '';
    const selectedReason = reasonSel !== '' ? reasonSel : presetReason;
    const resolvedReason = selectedReason === OTHER ? otherText.trim() : selectedReason;

    const canSubmit =
        !alreadyRefunded && !notDebit && !!resolvedReason &&
        Number(amount) > 0 &&
        (!billDriver || (!!driverId && Number(deductionAmount) > 0)) &&
        !processRefund.isPending;

    const handleSubmit = async () => {
        setErrorMsg('');
        if (!resolvedReason) {
            setErrorMsg('Please choose a refund reason.');
            return;
        }
        try {
            const response = await processRefund.mutateAsync({
                transaction_id: transaction.id,
                amount: Number(amount),
                refund_reason: resolvedReason,
                delivery_date: deliveryDate || null,
                billed_to_driver: billDriver,
                billed_driver_id: billDriver && driverId ? Number(driverId) : null,
                deduction_amount: billDriver ? Number(deductionAmount) : null,
            });
            toast.success('Refund processed');
            onSuccess?.(toRefundResult(response.data, transaction.id, resolvedReason));
            onClose();
        } catch (err) {
            const msg = err instanceof ApiError ? err.userMessage
                : err instanceof Error ? err.message : 'Failed to process refund';
            setErrorMsg(msg);
            toast.error(msg);
        }
    };

    return (
        <Modal isOpen onClose={onClose} title="Process Refund">
            <div className="space-y-4">
                <p className="text-sm text-slate-400">
                    Refund for transaction #{transaction.id}
                    {transaction.name ? ` — ${transaction.name}` : ''}
                </p>

                {alreadyRefunded && (
                    <div className="flex items-center gap-2 p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        This transaction has already been refunded.
                    </div>
                )}
                {notDebit && (
                    <div className="flex items-center gap-2 p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        Only a debit transaction can be refunded.
                    </div>
                )}

                {context && (context.order_id || context.delivery_date) && (
                    <p className="text-xs text-slate-500">
                        {context.order_id ? `Order #${context.order_id}` : 'No linked order'}
                        {context.delivery_date ? ` · delivered ${context.delivery_date}` : ''}
                    </p>
                )}

                <div>
                    <label className="block text-sm text-slate-300 mb-1">Refund Amount</label>
                    <input type="number" min={0.01} value={amount}
                        onChange={(e) => setAmount(e.target.value)} className={inputClassName} />
                </div>

                <div>
                    <label className="block text-sm text-slate-300 mb-1">
                        Reason <span className="text-red-400">*</span>
                    </label>
                    <select value={selectedReason} onChange={(e) => setReasonSel(e.target.value)} className={selectClassName}>
                        <option value="">Select a reason...</option>
                        {reasons.map((r) => <option key={r.label} value={r.label}>{r.label}</option>)}
                        <option value={OTHER}>Other (free text)</option>
                    </select>
                    {selectedReason === OTHER && (
                        <input type="text" value={otherText} onChange={(e) => setOtherText(e.target.value)}
                            placeholder="Describe the reason" className={`${inputClassName} mt-2`} />
                    )}
                </div>

                <div>
                    <label className="block text-sm text-slate-300 mb-1">Delivery Date</label>
                    <input type="date" value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)} className={dateInputClassName} />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={billDriver}
                        onChange={(e) => {
                            setBillDriver(e.target.checked);
                            if (e.target.checked) setDeductionAmount(amount);
                        }}
                        className="w-4 h-4 rounded accent-purple-500" />
                    Bill delivery boy (recover via monthly payslip)
                </label>

                {billDriver && (
                    <div className="space-y-3 pl-6 border-l border-slate-700/50">
                        <div>
                            <label className="block text-sm text-slate-300 mb-1">Driver</label>
                            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={selectClassName}>
                                <option value="">Select a driver...</option>
                                {driverOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            {context && !context.assigned_driver && (
                                <p className="mt-1 text-xs text-amber-400">
                                    No single driver is auto-assigned to this order — pick one.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm text-slate-300 mb-1">Amount to bill driver</label>
                            <input type="number" min={0.01} value={deductionAmount}
                                onChange={(e) => setDeductionAmount(e.target.value)} className={inputClassName} />
                        </div>
                    </div>
                )}

                {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

                <div className="flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl">
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={!canSubmit}
                        className="flex-1 px-4 py-2.5 text-sm text-white bg-green-600 hover:bg-green-700 rounded-xl disabled:opacity-50">
                        {processRefund.isPending ? 'Processing...' : 'Confirm Refund'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
