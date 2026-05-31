/**
 * AI-Accountant data hooks — config, customers, HSN, invoices, ledgers, Tally,
 * reminders, B2C consolidation, bank reconciliation.
 *
 * Read paths use TanStack Query; mutations are done inline in the pages via the
 * POST/PUT/DELETE helpers in @/lib/api (mirrors src/hooks/useInventory.ts).
 *
 * NUMERIC columns arrive as strings from the Postgres driver — fields typed
 * `number | string`; use Number(...) / the helpers in @/lib/accounting before maths.
 */

import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';

export interface Meta {
    total?: number;
    total_value?: number | string;
    page?: number;
    limit?: number;
}

/** GET that also surfaces the envelope `meta` block (backend list endpoints). */
async function getList<T>(
    path: string,
    params?: Record<string, unknown>,
): Promise<{ data: T[]; meta: Meta }> {
    const res = (await GET<T[]>(path, params)) as { data: T[]; meta?: Meta };
    return { data: res.data || [], meta: res.meta || {} };
}

// ── Config / org GST profile ────────────────────────────────────────────────

export interface OrgGstProfile {
    id: number;
    legal_name?: string | null;
    trade_name?: string | null;
    gstin?: string | null;
    supplier_state_code?: string | null;
    gst_registration_type?: number | null;
    default_hsn_code?: string | null;
    default_gst_rate?: number | string | null;
    einvoice_enabled?: number;
    einvoice_threshold_inr?: number | string | null;
    thresholds_verified_on?: string | null;
}

export interface AccountingConfig {
    profile: OrgGstProfile | null;
    accounting_enabled: boolean;
}

export function useAccountingConfig() {
    return useQuery({
        queryKey: ['accounting', 'config'],
        queryFn: async () => (await GET<AccountingConfig>('/accounting/config')).data,
    });
}

// ── Customers (GST profiles) ─────────────────────────────────────────────────

export interface AccountingCustomer {
    user_id: number;
    name: string;
    phone?: string | null;
    customer_type?: number | null;
    legal_name?: string | null;
    gstin?: string | null;
    pan?: string | null;
    place_of_supply_state_code?: string | null;
    credit_terms_days?: number | null;
}

export interface CustomerGstProfile {
    id: number;
    user_id: number;
    customer_type: number;
    legal_name?: string | null;
    gstin?: string | null;
    pan?: string | null;
    place_of_supply_state_code?: string | null;
    billing_address?: string | null;
    shipping_address?: string | null;
    credit_terms_days?: number | null;
}

export interface CustomerDetail {
    user: { id: number; name: string; phone?: string | null };
    profile: CustomerGstProfile | null;
    outstanding: number;
}

export function useAccountingCustomers(filters: Record<string, string> = {}) {
    return useQuery({
        queryKey: ['accounting', 'customers', filters],
        queryFn: () => getList<AccountingCustomer>('/accounting/customers', { limit: 200, ...filters }),
    });
}

export function useAccountingCustomer(userId: number | null) {
    return useQuery({
        queryKey: ['accounting', 'customer', userId],
        queryFn: async () => (await GET<CustomerDetail>(`/accounting/customers/${userId}`)).data,
        enabled: userId != null,
    });
}

// ── HSN management ────────────────────────────────────────────────────────────

export interface HsnRate {
    id: number;
    hsn_code_id: number;
    gst_rate: number | string;
    label?: string | null;
    is_default: number;
    is_active: number;
    product_count: number;
}

export interface HsnCode {
    id: number;
    code: string;
    description?: string | null;
    is_active: number;
    rates: HsnRate[];
}

export interface ProductGst {
    product_id: number;
    title: string;
    legacy_tax?: number | string | null;
    hsn_rate_id?: number | null;
    hsn_code?: string | null;
    gst_rate?: number | string | null;
    rate_label?: string | null;
}

export function useHsnCodes() {
    return useQuery({
        queryKey: ['accounting', 'hsn'],
        queryFn: async () => (await GET<HsnCode[]>('/accounting/hsn')).data || [],
    });
}

export function useProductsWithGst(filters: Record<string, string> = {}) {
    return useQuery({
        queryKey: ['accounting', 'hsn-products', filters],
        queryFn: () => getList<ProductGst>('/accounting/hsn/products', { limit: 500, ...filters }),
    });
}

// ── Invoices ───────────────────────────────────────────────────────────────

export interface InvoiceRow {
    id: number;
    invoice_number: string;
    invoice_date: string;
    user_id: number;
    customer_name?: string | null;
    document_type: number;
    supply_type?: number | null;
    taxable_value: number | string;
    cgst_amount: number | string;
    sgst_amount: number | string;
    igst_amount: number | string;
    round_off: number | string;
    total_amount: number | string;
    status: number;
    pdf_r2_key?: string | null;
}

export interface InvoiceLine {
    product_id?: number | null;
    description?: string | null;
    hsn_code?: string | null;
    qty: number | string;
    unit_price: number | string;
    taxable_amount: number | string;
    gst_rate: number | string;
    cgst_amount: number | string;
    sgst_amount: number | string;
    igst_amount: number | string;
}

export interface InvoiceDetail {
    invoice: InvoiceRow & {
        financial_year?: string;
        series_code?: string;
        supplier_gstin?: string | null;
        supplier_state_code?: string | null;
        customer_gstin?: string | null;
        place_of_supply_state_code?: string | null;
        customer_phone?: string | null;
        idempotency_source?: string | null;
        created_by_source?: number;
    };
    lines: InvoiceLine[];
}

export function useInvoices(filters: Record<string, string> = {}) {
    return useQuery({
        queryKey: ['accounting', 'invoices', filters],
        queryFn: () => getList<InvoiceRow>('/accounting/invoices', { limit: 200, ...filters }),
    });
}

export function useInvoice(id: number | null) {
    return useQuery({
        queryKey: ['accounting', 'invoice', id],
        queryFn: async () => (await GET<InvoiceDetail>(`/accounting/invoices/${id}`)).data,
        enabled: id != null,
    });
}

// ── Customer ledger ──────────────────────────────────────────────────────────

export interface LedgerEntry {
    id: number;
    entry_type: number;
    invoice_id?: number | null;
    receipt_id?: number | null;
    debit: number | string;
    credit: number | string;
    balance_after: number | string;
    note?: string | null;
    entry_date: string;
}

export interface CustomerLedger {
    customer: { id: number; name: string; phone?: string | null };
    outstanding: number;
    ageing: { current: number; d31_60: number; d61_90: number; d90_plus: number };
    entries: LedgerEntry[];
}

export function useCustomerLedger(userId: number | null) {
    return useQuery({
        queryKey: ['accounting', 'ledger', userId],
        queryFn: async () => (await GET<CustomerLedger>(`/accounting/ledgers/${userId}`)).data,
        enabled: userId != null,
    });
}

// ── Tally settings + sync queue ──────────────────────────────────────────────

export interface TallyConfig {
    id: number;
    bridge_url?: string | null;
    port?: number | null;
    company_name?: string | null;
    sales_ledger?: string | null;
    round_off_ledger?: string | null;
    cgst_ledger?: string | null;
    sgst_ledger?: string | null;
    igst_ledger?: string | null;
    b2c_consolidation_ledger?: string | null;
    default_debtor_ledger?: string | null;
    tally_posting_enabled: number;
    has_credentials: boolean;
}

export interface TallySyncRecord {
    id: number;
    entity_type: number;
    entity_id: number;
    idempotency_key: string;
    voucher_type?: string | null;
    status: string;
    tally_voucher_id?: string | null;
    retry_count: number;
    next_attempt_at?: string | null;
    last_error?: string | null;
    created_at?: string;
    updated_at?: string;
}

export function useTallySettings() {
    return useQuery({
        queryKey: ['accounting', 'tally-settings'],
        queryFn: async () => (await GET<TallyConfig | null>('/accounting/tally/settings')).data,
    });
}

export function useTallySyncRecords(filters: Record<string, string> = {}) {
    return useQuery({
        queryKey: ['accounting', 'tally-sync', filters],
        queryFn: () => getList<TallySyncRecord>('/accounting/tally/sync-records', { limit: 200, ...filters }),
    });
}

// ── Payment reminders ──────────────────────────────────────────────────────

export interface ReminderRule {
    id: number;
    offset_days: number;
    channels: string;
    template_title?: string | null;
    active: number;
    created_at?: string;
    updated_at?: string;
}

export interface ReminderLogEntry {
    id: number;
    invoice_id: number;
    rule_id: number;
    sent_at?: string;
    channel?: string;
    status?: string;
}

export interface ReminderRulesData {
    rules: ReminderRule[];
    recent_log: ReminderLogEntry[];
}

export function useReminderRules() {
    return useQuery({
        queryKey: ['accounting', 'reminders'],
        queryFn: async () => (await GET<ReminderRulesData>('/accounting/reminders/rules')).data,
    });
}

// ── B2C consolidation ────────────────────────────────────────────────────────

export interface ConsolidationLine {
    id: number;
    place_of_supply_state_code?: string | null;
    gst_rate: number | string;
    hsn_code?: string | null;
    taxable_value: number | string;
    cgst_amount: number | string;
    sgst_amount: number | string;
    igst_amount: number | string;
}

export interface ConsolidationRun {
    id: number;
    period: string;
    status: number;
    invoice_id?: number | null;
    generated_at?: string;
    approved_by?: number | null;
    approved_by_name?: string | null;
    approved_at?: string | null;
    invoice_number?: string | null;
    invoice_total?: number | string | null;
}

export interface ConsolidationTotals {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
}

export interface ConsolidationDetail {
    run: ConsolidationRun | null;
    lines: ConsolidationLine[];
    totals: ConsolidationTotals | null;
}

export function useConsolidation(month: string | null) {
    return useQuery({
        queryKey: ['accounting', 'b2c', month],
        queryFn: async () =>
            (await GET<ConsolidationDetail>('/accounting/b2c/consolidation', { month })).data,
        enabled: !!month,
    });
}

// ── Bank reconciliation ──────────────────────────────────────────────────────

export interface StatementImport {
    id: number;
    filename?: string | null;
    bank?: string | null;
    period_from?: string | null;
    period_to?: string | null;
    opening_balance?: number | string | null;
    closing_balance?: number | string | null;
    row_count: number;
    status: string;
    imported_by?: number | null;
    total_rows?: number;
    suggested_rows?: number;
    reconciled_rows?: number;
    created_at?: string;
}

export interface StatementRow {
    id: number;
    import_id: number;
    txn_date?: string | null;
    value_date?: string | null;
    narration?: string | null;
    amount: number | string;
    direction: number;
    ref_type?: string | null;
    ref_number?: string | null;
    running_balance?: number | string | null;
    match_status: number;
    matched_invoice_id?: number | null;
    matched_receipt_id?: number | null;
    match_score?: number | string | null;
    match_reasons?: string[] | null;
    matched_invoice_number?: string | null;
    matched_invoice_total?: number | string | null;
    matched_customer_name?: string | null;
}

export function useStatements() {
    return useQuery({
        queryKey: ['accounting', 'bank-statements'],
        queryFn: () => getList<StatementImport>('/accounting/bank/statements', { limit: 100 }),
    });
}

export function useStatementRows(importId: number | null, filters: Record<string, string> = {}) {
    return useQuery({
        queryKey: ['accounting', 'bank-rows', importId, filters],
        queryFn: async () =>
            (await GET<StatementRow[]>(`/accounting/bank/statements/${importId}/rows`, filters)).data || [],
        enabled: importId != null,
    });
}
