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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';

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
    /** invoice_line_item.id — required to issue a credit/debit note against this line. */
    invoice_line_item_id?: number | null;
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

// ── Credit / Debit notes (sales-return / supplementary against a tax invoice) ──

export interface IssueNoteLine {
    invoice_line_item_id: number;
    adjusted_qty: number;
}

export interface IssueNotePayload {
    invoiceId: number;
    note_type: 'credit' | 'debit';
    items: IssueNoteLine[];
    reason: string;
    note_date: string;
}

/**
 * Issue a credit or debit note against a B2B tax invoice. The backend posts a
 * credit_note / debit_note voucher + ledger entries and returns the new note;
 * we invalidate the source invoice so its detail reflects the adjustment.
 */
export function useIssueNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ invoiceId, ...body }: IssueNotePayload) => {
            const res = await POST<Record<string, unknown>>(
                `/accounting/invoices/${invoiceId}/issue-note`,
                body as unknown as Record<string, unknown>,
            );
            return res.data;
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['accounting', 'invoice', vars.invoiceId] });
            qc.invalidateQueries({ queryKey: ['accounting', 'invoices'] });
            qc.invalidateQueries({ queryKey: ['accounting', 'vouchers'] });
        },
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

// ══ Phase 2/3 GL: chart of accounts, vouchers, reports, GST returns, Tally ═══

export interface Period { fy?: string; from_date?: string; to_date?: string; }

export interface ChartLedger { id: number; name: string; code: string | null; ledger_kind: number; balance: number | string; balance_type: 'Dr' | 'Cr'; }
export interface ChartGroup { group_id: number; group_name: string; nature: number; affects_pl: number; ledgers: ChartLedger[]; subtotal: number | string; subtotal_type: 'Dr' | 'Cr'; }
export interface ChartOfAccounts { groups: ChartGroup[]; total_debit: number | string; total_credit: number | string; }
export function useChartOfAccounts() {
    return useQuery({
        queryKey: ['accounting', 'chart'],
        queryFn: async () => (await GET<ChartOfAccounts>('/accounting/gl/chart')).data,
    });
}

export interface AccountGroup { id: number; name: string; parent_group_id: number | null; nature: number; affects_pl: number; is_system: number; }
export function useAccountGroups() {
    return useQuery({
        queryKey: ['accounting', 'groups'],
        queryFn: async () => (await GET<AccountGroup[]>('/accounting/gl/groups')).data || [],
    });
}

export interface LedgerAccount { id: number; name: string; code: string | null; ledger_kind: number; account_group_id: number; group_name: string; nature: number; }
export function useLedgerAccounts(params: Record<string, string> = {}) {
    return useQuery({
        queryKey: ['accounting', 'ledgers-list', params],
        queryFn: async () => (await GET<LedgerAccount[]>('/accounting/gl/ledgers', params)).data || [],
    });
}

export interface TbLedger {
    ledgerId: number; ledgerName: string; groupName: string; nature: number; affectsPl: number;
    opening: number; debit: number; credit: number; closing: number; closingDebit: number; closingCredit: number;
}
export interface TrialBalance { fy: string; from: string; to: string; ledgers: TbLedger[]; totals: Record<string, number>; balanced: boolean; }
export function useTrialBalance(p: Period) {
    return useQuery({
        queryKey: ['accounting', 'tb', p],
        queryFn: async () => (await GET<TrialBalance>('/accounting/reports/trial-balance', p as Record<string, string>)).data,
    });
}

export interface BalanceSheetSide { ledgerName: string; groupName: string; amount: number; }
export interface BalanceSheet {
    as_on: string; assets: BalanceSheetSide[]; liabilities: BalanceSheetSide[]; equity: BalanceSheetSide[];
    totalAssets: number; totalLiabilities: number; totalEquity: number; netProfit: number; liabilitiesSide: number; balanced: boolean;
}
export function useBalanceSheet(asOn?: string) {
    return useQuery({
        queryKey: ['accounting', 'bs', asOn],
        queryFn: async () => (await GET<BalanceSheet>('/accounting/reports/balance-sheet', asOn ? { as_on: asOn } : {})).data,
    });
}

export interface ProfitAndLoss { fy: string; from: string; to: string; income: BalanceSheetSide[]; expense: BalanceSheetSide[]; totalIncome: number; totalExpense: number; netProfit: number; }
export function usePnl(p: Period) {
    return useQuery({
        queryKey: ['accounting', 'pnl', p],
        queryFn: async () => (await GET<ProfitAndLoss>('/accounting/reports/pnl', p as Record<string, string>)).data,
    });
}

export interface DayBookEntry { ledger_name: string; debit: number; credit: number; }
export interface DayBookVoucher { id: number; voucher_type: string; voucher_number: string; voucher_date: string; narration: string | null; party_name: string | null; entries: DayBookEntry[]; }
export function useDayBook(date?: string) {
    return useQuery({
        queryKey: ['accounting', 'daybook', date],
        queryFn: async () => (await GET<{ from: string; to: string; vouchers: DayBookVoucher[] }>('/accounting/reports/day-book', date ? { date } : {})).data,
    });
}

export function useLedgerStatement(ledgerId: number | null, p: Period) {
    return useQuery({
        queryKey: ['accounting', 'ledger-stmt', ledgerId, p],
        queryFn: async () => (await GET<Record<string, unknown>>(`/accounting/reports/ledger/${ledgerId}`, p as Record<string, string>)).data,
        enabled: ledgerId != null,
    });
}

export interface VoucherRow { id: number; voucher_type: string; voucher_number: string; voucher_date: string; narration: string | null; source: number; status: number; party_name: string | null; amount: number | string; }
export function useVouchers(params: Record<string, string> = {}) {
    return useQuery({
        queryKey: ['accounting', 'vouchers', params],
        queryFn: async () => (await GET<VoucherRow[]>('/accounting/vouchers', params)).data || [],
    });
}
export function useVoucher(id: number | null) {
    return useQuery({
        queryKey: ['accounting', 'voucher', id],
        queryFn: async () => (await GET<Record<string, unknown>>(`/accounting/vouchers/${id}`)).data,
        enabled: id != null,
    });
}

export interface GstReturnRow { id: number; return_type: number; period_key: string; status: number; total_taxable: number | string; total_tax: number | string; invoice_count: number; generated_at: string; }
export function useGstReturns() {
    return useQuery({
        queryKey: ['accounting', 'gst-returns'],
        queryFn: async () => (await GET<GstReturnRow[]>('/accounting/gst/returns')).data || [],
    });
}

export interface ReconRow { ledgerName: string; swarg: number; tally: number; diff: number; }
export interface Reconciliation { as_on: string; has_tally_snapshot: boolean; rows: ReconRow[]; mismatches: ReconRow[]; matched: boolean; }
export function useTallyReconcile(asOn?: string) {
    return useQuery({
        queryKey: ['accounting', 'reconcile', asOn],
        queryFn: async () => (await GET<Reconciliation>('/accounting/reconcile/trial-balance', asOn ? { as_on: asOn } : {})).data,
    });
}
export function useTallyImportRuns() {
    return useQuery({
        queryKey: ['accounting', 'import-runs'],
        queryFn: async () => (await GET<Array<Record<string, unknown>>>('/accounting/tally/import-runs')).data || [],
    });
}

export interface OpeningBalanceRow { id: number; ledger_account_id: number; ledger_name: string; group_name: string; debit: number | string; credit: number | string; is_provisional: number; posted_voucher_id: number | null; }
export interface OpeningBalances { fy: string; rows: OpeningBalanceRow[]; total_debit: number; total_credit: number; balanced: boolean; posted: boolean; }
export function useOpeningBalances(fy?: string) {
    return useQuery({
        queryKey: ['accounting', 'opening', fy],
        queryFn: async () => (await GET<OpeningBalances>('/accounting/opening-balances', fy ? { fy } : {})).data,
    });
}
