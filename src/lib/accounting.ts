/**
 * AI-Accountant shared constants, types, and formatters.
 *
 * Mirrors src/lib/crm.ts (label maps + badge classes) and feeds the accounting
 * pages + src/hooks/useAccounting.ts. NUMERIC columns arrive as strings from the
 * Postgres driver — types below are `number | string`; always Number(...) before
 * maths and use the money/percent helpers for display.
 */

export interface Option {
    value: string;
    label: string;
}

// ── Enums (match the backend SMALLINT codes) ────────────────────────────────

/** invoice.document_type */
export const DOCUMENT_TYPE_LABELS: Record<number, string> = {
    1: 'Tax Invoice',
    2: 'Bill of Supply',
    3: 'B2C Consolidated',
};

/** invoice.supply_type */
export const SUPPLY_TYPE_LABELS: Record<number, string> = {
    1: 'Intra-state (CGST+SGST)',
    2: 'Inter-state (IGST)',
};

/** invoice.status */
export const INVOICE_STATUS_LABELS: Record<number, string> = {
    1: 'Issued',
    2: 'Cancelled',
};

export const INVOICE_STATUS_BADGE: Record<number, string> = {
    1: 'bg-green-500/20 text-green-400',
    2: 'bg-red-500/20 text-red-400',
};

/** customer_gst_profile.customer_type */
export const CUSTOMER_TYPE_LABELS: Record<number, string> = {
    0: 'B2C',
    1: 'B2B',
};

/** org_gst_profile.gst_registration_type */
export const GST_REG_TYPE_OPTIONS: Option[] = [
    { value: '1', label: 'Regular' },
    { value: '2', label: 'Composition' },
    { value: '3', label: 'Unregistered' },
    { value: '4', label: 'SEZ' },
];

/** receipt.mode */
export const RECEIPT_MODE_OPTIONS: Option[] = [
    { value: '1', label: 'Online' },
    { value: '2', label: 'Cash' },
    { value: '3', label: 'Wallet' },
    { value: '4', label: 'Bank Transfer' },
];

/** customer_ledger_entry.entry_type */
export const LEDGER_ENTRY_TYPE_LABELS: Record<number, string> = {
    1: 'Invoice',
    2: 'Receipt',
    3: 'Adjustment',
};

/** tally_sync_record.status (VARCHAR) */
export const SYNC_STATUS_BADGE: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    sent: 'bg-blue-500/20 text-blue-400',
    confirmed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    skipped: 'bg-slate-600/30 text-slate-400',
};

export const SYNC_ENTITY_TYPE_LABELS: Record<number, string> = {
    1: 'Sales',
    2: 'Receipt',
};

/** bank_statement_import.status (VARCHAR) */
export const IMPORT_STATUS_BADGE: Record<string, string> = {
    uploaded: 'bg-slate-600/30 text-slate-400',
    parsed: 'bg-yellow-500/20 text-yellow-400',
    validated: 'bg-blue-500/20 text-blue-400',
    reconciled: 'bg-green-500/20 text-green-400',
};

/** bank_statement_row.match_status */
export const MATCH_STATUS_LABELS: Record<number, string> = {
    0: 'Unmatched',
    1: 'Suggested',
    2: 'Confirmed',
    3: 'Manual',
    4: 'Ignored',
};

export const MATCH_STATUS_BADGE: Record<number, string> = {
    0: 'bg-slate-600/30 text-slate-400',
    1: 'bg-yellow-500/20 text-yellow-400',
    2: 'bg-green-500/20 text-green-400',
    3: 'bg-cyan-500/20 text-cyan-400',
    4: 'bg-slate-700/50 text-slate-500',
};

/** bank_statement_row.direction */
export const DIRECTION = { CREDIT: 1, DEBIT: 2 } as const;

/** b2c_consolidation_run.status */
export const RUN_STATUS_LABELS: Record<number, string> = {
    1: 'Draft',
    2: 'Approved',
    3: 'Posted',
};

export const RUN_STATUS_BADGE: Record<number, string> = {
    1: 'bg-yellow-500/20 text-yellow-400',
    2: 'bg-blue-500/20 text-blue-400',
    3: 'bg-green-500/20 text-green-400',
};

// ── Formatters ──────────────────────────────────────────────────────────────

export function formatINR(value: number | string | null | undefined): string {
    const n = Number(value) || 0;
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: number | string | null | undefined): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return `${n}%`;
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

/** Current month as 'YYYY-MM' (the B2C period picker default). */
export function currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function documentTypeLabel(t: number | string | null | undefined): string {
    return DOCUMENT_TYPE_LABELS[Number(t)] || '-';
}

export function invoiceStatusLabel(s: number | string | null | undefined): string {
    return INVOICE_STATUS_LABELS[Number(s)] || '-';
}

// ══ Phase 2/3 GL labels + period helpers ════════════════════════════════════

export const NATURE_LABELS: Record<number, string> = {
    1: 'Asset', 2: 'Liability', 3: 'Income', 4: 'Expense', 5: 'Equity',
};

export const VOUCHER_TYPE_LABELS: Record<string, string> = {
    sales: 'Sales', purchase: 'Purchase', receipt: 'Receipt', payment: 'Payment',
    contra: 'Contra', journal: 'Journal', credit_note: 'Credit Note', debit_note: 'Debit Note',
    estimate: 'Estimate', purchase_order: 'Purchase Order', expense: 'Expense', income: 'Income',
    opening_balance: 'Opening Balance',
};

/** Voucher types an operator may create by hand (the rest auto-post). */
export const MANUAL_VOUCHER_TYPES: Option[] = [
    { value: 'journal', label: 'Journal' },
    { value: 'payment', label: 'Payment' },
    { value: 'receipt', label: 'Receipt (manual)' },
    { value: 'contra', label: 'Contra (bank ↔ cash)' },
    { value: 'expense', label: 'Expense' },
    { value: 'income', label: 'Income' },
    { value: 'credit_note', label: 'Credit Note' },
    { value: 'debit_note', label: 'Debit Note' },
];

export const VOUCHER_SOURCE_LABELS: Record<number, string> = {
    1: 'System', 2: 'Manual', 3: 'AI', 4: 'Tally import',
};

export const RETURN_TYPE_LABELS: Record<number, string> = {
    1: 'GSTR-1', 2: 'GSTR-3B', 3: 'GSTR-9',
};

export function voucherTypeLabel(t: string | null | undefined): string {
    return VOUCHER_TYPE_LABELS[String(t)] || String(t || '-');
}

/** Current Indian financial year 'YYYY-YYYY' (Apr–Mar). */
export function currentFy(): string {
    const d = new Date();
    const y = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
    return `${y}-${y + 1}`;
}

/** A few recent FYs for a selector. */
export function fyOptions(count = 4): Option[] {
    const [start] = currentFy().split('-').map(Number);
    return Array.from({ length: count }, (_, i) => {
        const y = start - i;
        return { value: `${y}-${y + 1}`, label: `FY ${y}-${String(y + 1).slice(2)}` };
    });
}

/** FY 'YYYY-YYYY' → { from:'YYYY-04-01', to:'YYYY-03-31' }. */
export function fyBounds(fy: string): { from: string; to: string } {
    const [a, b] = fy.split('-');
    return { from: `${a}-04-01`, to: `${b}-03-31` };
}
