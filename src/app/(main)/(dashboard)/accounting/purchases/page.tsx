'use client';

import { useState, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, PUT, POST } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { PodLink } from '@/components/PodImage';
import BulkPurchaseImportModal from '@/components/accounting/BulkPurchaseImportModal';
import LedgerPicker from '@/components/accounting/LedgerPicker';
import { useVendors, useRawMaterials } from '@/hooks/useInventory';
import { useTallySettings } from '@/hooks/useAccounting';
import { CheckCircle2, XCircle, Edit, Image as ImageIcon, Upload, Eye, EyeOff, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { formatApiDate } from '@/lib/dateUtils';

const inputCls =
  'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const TOTAL_COL_KEY = 'purchases.showTotal';
/** Local writes don't fire 'storage' (that's cross-tab only) — we dispatch this. */
const PREF_CHANGED = 'swarg:pref-changed';

/**
 * A boolean UI preference kept in localStorage.
 *
 * useSyncExternalStore rather than useState + useEffect: the server snapshot is
 * explicit (so there is no hydration mismatch when the stored value differs from
 * the default) and there is no setState-in-effect render cascade.
 */
function usePersistedFlag(key: string, defaultValue: boolean): [boolean, () => void] {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('storage', onChange);
    window.addEventListener(PREF_CHANGED, onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener(PREF_CHANGED, onChange);
    };
  }, []);
  const getSnapshot = useCallback(() => {
    const raw = localStorage.getItem(key);
    return raw == null ? defaultValue : raw !== '0';
  }, [key, defaultValue]);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => defaultValue);
  const toggle = useCallback(() => {
    localStorage.setItem(key, value ? '0' : '1');
    window.dispatchEvent(new Event(PREF_CHANGED));
  }, [key, value]);
  return [value, toggle];
}

/** green|amber|red|neutral, classified server-side by utils/qualityBand.js. */
type QualityBand = 'green' | 'amber' | 'red' | 'neutral';

interface QualityValue {
  name: string;
  value: string | null;
  unit: string | null;
  band?: QualityBand;
  // Thresholds come along only so the badge tooltip can show the spec the band
  // was judged against — the classification itself is the backend's job.
  min_value?: number | string | null;
  max_value?: number | string | null;
  warn_min?: number | string | null;
  warn_max?: number | string | null;
}

interface PurchaseRow {
  id: number;
  purchase_date: string;
  /** When the row reached the server (IST). For an ONLINE pickup this is the
   *  moment the driver submitted; for one captured offline it is the sync time —
   *  the app sends no device-side capture timestamp today. */
  created_at?: string | null;
  captured_by_user_id?: number | null;
  captured_by_name?: string | null;
  invoice_no: string | null;
  qty: number | string;
  unit_price: number | string;
  total_amount: number | string;
  taxable_amount: number | string | null;
  cgst_amount: number | string | null;
  sgst_amount: number | string | null;
  igst_amount: number | string | null;
  gst_rate: number | string | null;
  hsn_code: string | null;
  supply_type: number | null;
  status: string;
  source: string;
  ocr_confidence: number | string | null;
  /** Deferred-OCR state (migration 110). NULL on rows captured before it. */
  ocr_status?: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | null;
  ocr_error?: string | null;
  ocr_run_count?: number | null;
  photos?: string[];
  vendor_id: number;
  raw_material_id: number;
  vendor_name: string;
  raw_material_name: string;
  raw_material_unit: string;
  quality_readings?: QualityValue[];
}

interface QualityReading {
  id: number;
  value_numeric: number | string | null;
  value_text: string | null;
  source: string;
  param_name: string;
  param_unit: string | null;
  band?: QualityBand;
  min_value?: number | string | null;
  max_value?: number | string | null;
  warn_min?: number | string | null;
  warn_max?: number | string | null;
}

type PurchaseDetail = Omit<PurchaseRow, 'quality_readings'> & {
  vendor_gstin?: string | null;
  quality_readings: QualityReading[];
  notes?: string | null;
  account_head_ledger_id?: number | null;
  account_head_name?: string | null;
  fat_pricing?: {
    pricing_mode: 'per_fat';
    fat_rate: number;
    fat_value: number;
    suggested_unit_price: number;
  } | null;
};

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'pending', label: 'To review' },
  { key: 'posted', label: 'Posted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

/** Source shown as words an operator uses. 'ocr' is blank on purpose — the
 *  confidence badge beside it already says OCR. */
const SOURCE_LABEL: Record<string, string> = {
  ocr: '',
  manual: 'Manual',
  'bulk-import': 'Bulk import',
};

const statusBadge = (s: string) => {
  switch (s) {
    case 'posted': return 'bg-green-500/20 text-green-400';
    case 'draft': return 'bg-amber-500/20 text-amber-400';
    case 'reviewed': return 'bg-blue-500/20 text-blue-400';
    case 'rejected': return 'bg-red-500/20 text-red-400';
    default: return 'bg-slate-700/50 text-slate-400';
  }
};

// Quality readings: cap numeric values at 2 decimals (drop trailing zeros);
// pass non-numeric text readings through unchanged.
const fmtReading = (v: number | string | null | undefined): string => {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(v);
};

// Quality bands. The backend classifies (utils/qualityBand.js) against the
// per-parameter thresholds; here we only paint. Neutral renders exactly as the
// page did before bands existed, so an unconfigured parameter looks untouched.
const BAND_CLS: Record<QualityBand, string> = {
  green: 'bg-green-500/20 text-green-400',
  amber: 'bg-amber-500/20 text-amber-400',
  red: 'bg-red-500/20 text-red-400',
  neutral: '',
};

/** "on target 3.5–6, spec 3–6.5" — what the badge colour was judged against. */
const bandTooltip = (q: QualityValue): string => {
  const range = (lo: unknown, hi: unknown) =>
    lo != null || hi != null ? `${lo ?? '−∞'}–${hi ?? '∞'}` : null;
  const target = range(q.warn_min, q.warn_max);
  const spec = range(q.min_value, q.max_value);
  const parts = [target ? `on target ${target}` : null, spec ? `spec ${spec}` : null].filter(Boolean);
  if (!parts.length) return `${q.name}: no thresholds configured`;
  return `${q.name}: ${parts.join(', ')}`;
};

function QualityCell({ reading }: { reading: QualityValue | undefined }) {
  if (!reading || reading.value == null) return <span className="text-slate-600">—</span>;
  const text = (
    <>
      {fmtReading(reading.value)}
      {reading.unit ? <span className="text-slate-500 text-xs"> {reading.unit}</span> : null}
    </>
  );
  const band = reading.band ?? 'neutral';
  if (band === 'neutral') return <span>{text}</span>;
  return (
    <span
      className={`text-xs px-2 py-1 rounded-lg whitespace-nowrap ${BAND_CLS[band]}`}
      title={bandTooltip(reading)}
    >
      {text}
    </span>
  );
}

/**
 * Deferred-OCR state (migration 110). Only the states an operator can act on get
 * a chip: 'done' is the happy path and says nothing useful next to the readings
 * it produced, and a NULL status is a bill captured before the feature existed.
 */
function OcrStatusChip({ row }: { row: PurchaseRow }) {
  switch (row.ocr_status) {
    case 'running':
      return (
        <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-400 whitespace-nowrap"
          title="Reading the photo — this row refreshes when it finishes">
          reading…
        </span>
      );
    case 'pending':
      return (
        <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700/50 text-slate-400 whitespace-nowrap"
          title="Queued — the sweep picks this up within a minute or two">
          queued
        </span>
      );
    case 'failed':
      return (
        <span className="text-xs px-2 py-0.5 rounded-lg bg-red-500/20 text-red-400 whitespace-nowrap"
          title={row.ocr_error || 'OCR failed'}>
          OCR failed
        </span>
      );
    case 'done':
      // A finished read used to render nothing, so a row that had just been
      // read looked identical to one nothing had ever touched.
      return (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500/80 shrink-0"
          aria-label="Photo read" />
      );
    default:
      return null;
  }
}

// Amber below the auto-post threshold, red below 0.5 — both mean "open the photo
// and verify the numbers before approving". At/above threshold it's informational.
function OcrConfidenceBadge({ confidence, threshold }: { confidence: number | string | null | undefined; threshold: number }) {
  if (confidence == null) return null;
  const c = Number(confidence);
  if (!Number.isFinite(c)) return null;
  const pct = `${Math.round(c * 100)}%`;
  if (c < 0.5) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-lg bg-red-500/20 text-red-400 whitespace-nowrap"
        title="Very low OCR confidence — check the bill photo before approving">
        OCR {pct} · check photo
      </span>
    );
  }
  if (c < threshold) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 whitespace-nowrap"
        title="Below the auto-post confidence threshold — check the bill photo">
        OCR {pct} · check photo
      </span>
    );
  }
  return <span className="text-xs text-slate-400 whitespace-nowrap">OCR {pct}</span>;
}

export default function AccountingPurchasesPage() {
  const queryClient = useQueryClient();
  const { data: vendors = [] } = useVendors();
  const { data: rawMaterials = [] } = useRawMaterials();
  const { data: tallyCfg } = useTallySettings();
  const autoPostThreshold = Number(tallyCfg?.purchase_auto_post_confidence ?? 0.9) || 0.9;
  const [tab, setTab] = useState('pending');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    qty: '', unit_price: '', gst_rate: '', supply_type: '1', hsn_code: '', invoice_no: '',
    vendor_id: '', raw_material_id: '', account_head_ledger_id: '',
  });
  // Multi-select for bulk approval (only meaningful on the To-review tab).
  const [selected, setSelected] = useState<Set<number | string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  // Hide the Total column for screenshots shared into supplier quality groups.
  // Persisted so the choice survives a reload; the CSV export always includes it.
  const [showTotal, toggleTotal] = usePersistedFlag(TOTAL_COL_KEY, true);
  // Correcting a POSTED bill (reverse-and-repost). Separate from the draft edit path.
  const [correcting, setCorrecting] = useState(false);
  const [correctReason, setCorrectReason] = useState('');
  const [correctionDate, setCorrectionDate] = useState('');
  useEffect(() => { setSelected(new Set()); }, [tab]);

  // 'pending' tab maps to the API default (draft + reviewed) — no status param.
  const statusParam = tab === 'pending' ? undefined : { status: tab };
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['accounting', 'purchases', tab],
    queryFn: async () => (await GET<PurchaseRow[]>('/accounting/purchases', statusParam)).data || [],
    // OCR runs server-side and takes 30–90s, so the row that says "reading…"
    // only becomes correct on a refetch. Poll while any is in flight, then stop.
    refetchInterval: (query) => {
      const data = query.state.data as PurchaseRow[] | undefined;
      const busy = (data || []).some((r) => r.ocr_status === 'running' || r.ocr_status === 'pending');
      return busy ? 10_000 : false;
    },
  });

  const { data: detail } = useQuery({
    queryKey: ['accounting', 'purchase', selectedId],
    queryFn: async () => (await GET<PurchaseDetail>(`/accounting/purchases/${selectedId}`)).data,
    enabled: selectedId != null,
  });

  const openDetail = (row: PurchaseRow) => {
    setSelectedId(row.id);
    setCorrecting(false); setCorrectReason(''); setCorrectionDate('');
    setForm({
      qty: String(row.qty ?? ''),
      unit_price: String(row.unit_price ?? ''),
      gst_rate: row.gst_rate != null ? String(row.gst_rate) : '',
      supply_type: String(row.supply_type ?? 1),
      hsn_code: row.hsn_code || '',
      invoice_no: row.invoice_no || '',
      vendor_id: row.vendor_id != null ? String(row.vendor_id) : '',
      raw_material_id: row.raw_material_id != null ? String(row.raw_material_id) : '',
      account_head_ledger_id: '', // filled from detail (only getPurchase returns it)
    });
  };

  // The account head + party ids only come back on the detail fetch — sync them
  // into the form once the selected purchase's detail loads.
  useEffect(() => {
    if (detail && detail.id === selectedId) {
      setForm((f) => ({
        ...f,
        account_head_ledger_id: detail.account_head_ledger_id != null ? String(detail.account_head_ledger_id) : '',
        vendor_id: f.vendor_id || (detail.vendor_id != null ? String(detail.vendor_id) : ''),
        raw_material_id: f.raw_material_id || (detail.raw_material_id != null ? String(detail.raw_material_id) : ''),
      }));
    }
  }, [detail, selectedId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['accounting', 'purchases'] });
    queryClient.invalidateQueries({ queryKey: ['accounting', 'purchase', selectedId] });
  };

  // Re-read one bill's photo. The API answers 202 the moment it has claimed the
  // row — the actual Gemini call outlives the HTTP request — so success here
  // means "started", and the row's ocr_status is what reports the outcome.
  const reocr = useMutation({
    mutationFn: async ({ id, force }: { id: number; force?: boolean }) =>
      POST(`/accounting/purchases/${id}/reocr`, force ? { force: true } : {}),
    onSuccess: () => { toast.success('Reading the photo — the row updates when it finishes'); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not start OCR'),
  });

  const bulkReocr = useMutation({
    mutationFn: async (ids: number[]) => POST('/accounting/purchases/bulk_reocr', { ids }),
    onSuccess: (res) => {
      toast.success(res?.message || 'Queued for OCR');
      setSelected(new Set());
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Bulk OCR failed'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => PUT(`/accounting/purchases/${selectedId}`, {
      qty: Number(form.qty), unit_price: Number(form.unit_price),
      gst_rate: form.gst_rate === '' ? null : Number(form.gst_rate),
      supply_type: Number(form.supply_type), hsn_code: form.hsn_code || null,
      invoice_no: form.invoice_no || null,
      vendor_id: form.vendor_id ? Number(form.vendor_id) : undefined,
      raw_material_id: form.raw_material_id ? Number(form.raw_material_id) : undefined,
      account_head_ledger_id: form.account_head_ledger_id === '' ? null : Number(form.account_head_ledger_id),
    }),
    onSuccess: () => { toast.success('Saved'); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => POST(`/accounting/purchases/${id}/approve`, {}),
    onSuccess: () => { toast.success('Approved & posted to Tally queue'); setSelectedId(null); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => POST(`/accounting/purchases/${id}/reject`, {}),
    onSuccess: () => { toast.success('Rejected'); setSelectedId(null); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to reject'),
  });

  // Correct a POSTED bill's cost — reverses the live ledger entry and re-posts the
  // new amount in the correction period. Only cost fields + a reason are sent.
  const correctMutation = useMutation({
    mutationFn: async () => POST(`/accounting/purchases/${selectedId}/correct`, {
      qty: Number(form.qty), unit_price: Number(form.unit_price),
      gst_rate: form.gst_rate === '' ? null : Number(form.gst_rate),
      supply_type: Number(form.supply_type),
      account_head_ledger_id: form.account_head_ledger_id === '' ? null : Number(form.account_head_ledger_id),
      reason: correctReason.trim(),
      correction_date: correctionDate || undefined,
    }),
    onSuccess: (res) => {
      const posted = ((res as { data?: { gl_posted?: boolean } })?.data)?.gl_posted !== false;
      if (posted) toast.success('Bill corrected — ledger reversed & re-posted');
      else toast.warning('Bill updated — ledger sync is pending and will self-heal. Do not re-submit.');
      setCorrecting(false); setCorrectReason(''); setCorrectionDate(''); setSelectedId(null); invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to correct'),
  });

  const bulkApprove = useMutation({
    mutationFn: async (ids: number[]) => POST('/accounting/purchases/bulk_approve', { ids }),
    onSuccess: (res) => {
      const d = ((res as { data?: { approved?: number; failed?: number } })?.data) ?? {};
      toast.success(`Approved ${d.approved ?? 0}${d.failed ? `, ${d.failed} failed` : ''}`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['accounting', 'purchases'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Bulk approve failed'),
  });

  const bulkReject = useMutation({
    mutationFn: async (ids: number[]) => POST('/accounting/purchases/bulk_reject', { ids }),
    onSuccess: (res) => {
      const d = ((res as { data?: { rejected?: number; failed?: number } })?.data) ?? {};
      toast.success(`Rejected ${d.rejected ?? 0}${d.failed ? `, ${d.failed} failed` : ''}`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['accounting', 'purchases'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Bulk reject failed'),
  });

  // Export the currently filtered/sorted rows as a clean CSV that includes quantity.
  const exportPurchasesCsv = (filtered: PurchaseRow[]) => {
    const headers = ['Date', 'Captured at', 'Captured by', 'Vendor', 'Material', 'Qty', 'Unit', 'Unit price', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Status', 'Invoice no'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map((r) => [
      r.purchase_date, formatApiDate(r.created_at, 'dd-MM-yyyy HH:mm', ''), r.captured_by_name ?? '',
      r.vendor_name, r.raw_material_name,
      Number(r.qty ?? 0), r.raw_material_unit, Number(r.unit_price ?? 0),
      Number(r.taxable_amount ?? 0), Number(r.cgst_amount ?? 0), Number(r.sgst_amount ?? 0),
      Number(r.igst_amount ?? 0), Number(r.total_amount ?? 0), r.status, r.invoice_no ?? '',
    ].map(esc).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchases-${tab}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Quality parameters present in the current rows (Fat, CLR, …) become their
  // own list columns so the accountant reviews values without opening each bill.
  const qualityParams = useMemo(() => {
    const names = new Set<string>();
    rows.forEach((r) => (r.quality_readings || []).forEach((q) => q?.name && names.add(q.name)));
    return [...names].slice(0, 5);
  }, [rows]);

  const columns: Column<PurchaseRow>[] = [
    {
      key: 'edit', header: '', width: '50px', sortable: false,
      render: (r) => (
        <button onClick={() => openDetail(r)} className="p-2 hover:bg-slate-800/50 rounded-lg">
          <Edit className="w-4 h-4 text-purple-400" />
        </button>
      ),
    },
    {
      key: 'purchase_date', header: 'Date', width: '105px',
      render: (r) => formatApiDate(r.purchase_date, 'dd-MM-yyyy'),
    },
    {
      key: 'created_at', header: 'Captured', width: '150px',
      // Its own column rather than a footnote under Date: on the quality
      // screenshot this is how you tell a pickup logged at the dock from one
      // that showed up hours later, and who logged it.
      render: (r) => (
        <span className="block leading-tight">
          <span title="When the record reached the server (IST)">
            {formatApiDate(r.created_at, 'dd-MM HH:mm')}
          </span>
          {r.captured_by_name ? (
            <span className="block text-[11px] text-slate-500 truncate" title="Captured by">
              {r.captured_by_name}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: 'vendor_name', header: 'Vendor' },
    {
      key: 'raw_material_name', header: 'Material',
      render: (r) => <span>{r.raw_material_name} <span className="text-slate-500">({Number(r.qty)} {r.raw_material_unit})</span></span>,
    },
    ...qualityParams.map((param): Column<PurchaseRow> => ({
      key: `quality_${param}`, header: param, width: '90px', sortable: false,
      render: (r) => <QualityCell reading={(r.quality_readings || []).find((q) => q.name === param)} />,
    })),
    {
      key: 'source', header: 'Source', width: '210px',
      render: (r) => {
        const busy = r.ocr_status === 'running' || r.ocr_status === 'pending';
        const hasPhoto = (r.photos || []).length > 0;
        const editable = r.status === 'draft' || r.status === 'reviewed';
        // A previously-failed bill needs force — the runner's attempt fuse
        // deliberately stops the sweep retrying it forever.
        const force = Number(r.ocr_run_count || 0) >= 3;
        return (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            {/* The confidence badge already reads "OCR 98%", so printing the raw
                source beside it gave "ocr OCR 98%". Show a word only when it
                adds something. */}
            {SOURCE_LABEL[r.source] ?? r.source}
            <OcrStatusChip row={r} />
            <OcrConfidenceBadge confidence={r.ocr_confidence} threshold={autoPostThreshold} />
            {hasPhoto && editable && (
              // Shown even while the row says "reading" or "queued". A run that
              // dies mid-flight leaves the row stuck, and hiding the button then
              // left no way back except the bulk queue — which itself needs the
              // sweep switched on. The backend is the authority: it 409s a run
              // that genuinely holds the lease, and that reply is informative.
              <button type="button"
                onClick={() => reocr.mutate({ id: r.id, force })}
                disabled={reocr.isPending}
                title={busy
                  ? 'Still reading — click to retry if it has been stuck a while'
                  : force
                    ? `Failed ${r.ocr_run_count} times — read the photo again anyway`
                    : 'Read the bill photo again and refill the quality readings'}
                className="p-1 rounded hover:bg-slate-800/50 disabled:opacity-50">
                <ScanLine className={`w-3.5 h-3.5 ${busy ? 'text-slate-500' : 'text-cyan-400'}`} />
              </button>
            )}
          </span>
        );
      },
    },
    // Total sits after Source so it is the last thing before Status, and it drops
    // out entirely when the operator hides it (this page gets screenshotted into
    // supplier quality groups, where the money column has no business).
    ...(showTotal ? [{
      key: 'total_amount', header: 'Total', width: '110px',
      render: (r: PurchaseRow) => <span className="text-cyan-400">₹{Number(r.total_amount ?? 0).toFixed(2)}</span>,
    } as Column<PurchaseRow>] : []),
    {
      key: 'status', header: 'Status', width: '100px',
      render: (r) => <span className={`text-xs px-2 py-1 rounded-lg ${statusBadge(r.status)}`}>{r.status}</span>,
    },
  ];

  const canEdit = detail && detail.status !== 'posted' && detail.status !== 'rejected';
  // Cost fields are editable for drafts (canEdit) OR when correcting a posted bill.
  const costEditable = canEdit || correcting;
  const previewTotal = (Number(form.qty) || 0) * (Number(form.unit_price) || 0) * (1 + (Number(form.gst_rate) || 0) / 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchases / Bills</h1>
          <p className="text-slate-400">Review raw-material purchases, then post them as Tally Purchase vouchers.</p>
        </div>
        <div className="self-start flex items-center gap-2">
          <button onClick={toggleTotal} type="button"
            title={showTotal ? 'Hide the Total column — for screenshots shared outside accounts' : 'Show the Total column'}
            aria-pressed={!showTotal}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border ${showTotal
              ? 'bg-slate-800/40 text-slate-300 border-slate-700/50 hover:bg-slate-800/70'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'}`}>
            {showTotal ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showTotal ? 'Total shown' : 'Total hidden'}
          </button>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600">
            <Upload className="w-5 h-5" /> Import bills
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === t.key ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-800/40 text-slate-400 border border-slate-700/50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pending' && selected.size > 0 && (
        <div className="flex items-center gap-3 glass rounded-xl px-4 py-2">
          <span className="text-sm text-slate-300">{selected.size} selected</span>
          <button onClick={() => bulkApprove.mutate([...selected].map(Number))} disabled={bulkApprove.isPending || bulkReject.isPending}
            className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Approve selected ({selected.size})
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Reject ${selected.size} selected bill(s)? Rejected bills never post to stock or Tally.`)) {
                bulkReject.mutate([...selected].map(Number));
              }
            }}
            disabled={bulkApprove.isPending || bulkReject.isPending}
            className="px-4 py-2 bg-gradient-to-r from-rose-500 to-red-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
            <XCircle className="w-4 h-4" /> Reject selected ({selected.size})
          </button>
          <button onClick={() => bulkReocr.mutate([...selected].map(Number))}
            disabled={bulkReocr.isPending || bulkApprove.isPending || bulkReject.isPending}
            title="Queue these bills for the OCR sweep — it works through them a couple a minute"
            className="px-4 py-2 bg-slate-800/60 text-cyan-300 border border-cyan-500/30 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
            <ScanLine className="w-4 h-4" /> Re-read photos ({selected.size})
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-slate-400 hover:text-slate-200">Clear</button>
        </div>
      )}

      <DataTable data={rows} columns={columns} loading={isLoading} pageSize={50}
        searchPlaceholder="Search purchases..."
        getRowId={(r) => r.id} selectable={tab === 'pending'} selectedIds={selected} onSelectionChange={setSelected}
        exportable onExport={exportPurchasesCsv} />

      <Modal isOpen={selectedId != null} onClose={() => { setSelectedId(null); setCorrecting(false); setCorrectReason(''); setCorrectionDate(''); }} title={`Purchase #${selectedId ?? ''}`}>
        {!detail ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">GSTIN:</span> <span className="text-white">{detail.vendor_gstin || '—'}</span></div>
              <div><span className="text-slate-500">Status:</span> <span className={`text-xs px-2 py-0.5 rounded ${statusBadge(detail.status)}`}>{detail.status}</span></div>
              {detail.ocr_confidence != null && (
                <div className="col-span-2">
                  <span className="text-slate-500">OCR:</span>{' '}
                  <OcrConfidenceBadge confidence={detail.ocr_confidence} threshold={autoPostThreshold} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Vendor</label>
                <select value={form.vendor_id} disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} className={inputCls}>
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Material</label>
                <select value={form.raw_material_id} disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, raw_material_id: e.target.value })} className={inputCls}>
                  <option value="">Select material…</option>
                  {rawMaterials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Account head — GL ledger this bill posts to (blank = Purchase account)</label>
                <LedgerPicker value={form.account_head_ledger_id ? Number(form.account_head_ledger_id) : null}
                  disabled={!costEditable}
                  onChange={(sel) => setForm({ ...form, account_head_ledger_id: sel ? String(sel.id) : '' })}
                  placeholder={detail.account_head_name || 'Default: Purchase account'} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Qty ({detail.raw_material_unit})</label>
                <input type="number" step="any" value={form.qty} disabled={!costEditable}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Unit price</label>
                <input type="number" step="any" value={form.unit_price} disabled={!costEditable}
                  onChange={(e) => setForm({ ...form, unit_price: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">GST rate %</label>
                <input type="number" step="any" value={form.gst_rate} disabled={!costEditable}
                  onChange={(e) => setForm({ ...form, gst_rate: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Supply</label>
                <select value={form.supply_type} disabled={!costEditable}
                  onChange={(e) => setForm({ ...form, supply_type: e.target.value })} className={inputCls}>
                  <option value="1">Intra-state (CGST+SGST)</option>
                  <option value="2">Inter-state (IGST)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">HSN code</label>
                <input type="text" value={form.hsn_code} disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Invoice no.</label>
                <input type="text" value={form.invoice_no} disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} className={inputCls} />
              </div>
            </div>

            {detail.fat_pricing && costEditable && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
                <span>
                  Fat-based price: <span className="text-white font-medium">{detail.fat_pricing.fat_value}</span> fat
                  × ₹{detail.fat_pricing.fat_rate}/point
                  = <span className="text-white font-semibold">₹{detail.fat_pricing.suggested_unit_price.toFixed(2)}</span> per {detail.raw_material_unit || 'unit'}
                </span>
                {Number(form.unit_price) !== detail.fat_pricing.suggested_unit_price ? (
                  <button
                    onClick={() => setForm({ ...form, unit_price: String(detail.fat_pricing!.suggested_unit_price) })}
                    className="px-3 py-1 bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 rounded-lg text-xs font-medium hover:bg-cyan-500/30">
                    Apply suggested price
                  </button>
                ) : (
                  <span className="text-xs text-cyan-400">applied ✓</span>
                )}
              </div>
            )}

            <div className="text-sm text-slate-300 bg-slate-800/40 rounded-lg px-3 py-2">
              Taxable ₹{Number(detail.taxable_amount ?? 0).toFixed(2)} · CGST ₹{Number(detail.cgst_amount ?? 0).toFixed(2)} ·
              SGST ₹{Number(detail.sgst_amount ?? 0).toFixed(2)} · IGST ₹{Number(detail.igst_amount ?? 0).toFixed(2)} ·
              <span className="text-cyan-400"> Total ₹{Number(detail.total_amount ?? 0).toFixed(2)}</span>
            </div>

            {detail.quality_readings?.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Quality readings</p>
                <div className="flex flex-wrap gap-2">
                  {detail.quality_readings.map((q) => {
                    const band = q.band ?? 'neutral';
                    return (
                      <span key={q.id}
                        className={`text-xs rounded px-2 py-1 ${band === 'neutral' ? 'bg-slate-800/40 text-slate-300' : BAND_CLS[band]}`}
                        title={bandTooltip({ name: q.param_name, value: null, unit: q.param_unit, ...q })}>
                        {q.param_name}: {q.value_numeric != null ? fmtReading(q.value_numeric) : (q.value_text ?? '—')}{q.param_unit ? ` ${q.param_unit}` : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {detail.photos && detail.photos.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5" /> Photos
                  {canEdit && (
                    <button type="button" onClick={() => reocr.mutate({ id: detail.id, force: true })}
                      disabled={reocr.isPending}
                      title="Read these photos again and refill the quality readings"
                      className="ml-2 px-2 py-0.5 rounded-lg bg-slate-800/60 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 disabled:opacity-50">
                      <ScanLine className="w-3 h-3" />
                      {detail.ocr_status === 'running' ? 'reading…' : 'Re-read'}
                    </button>
                  )}
                </p>
                {detail.ocr_status === 'failed' && detail.ocr_error && (
                  <p className="text-xs text-red-400 mb-1">Last OCR attempt: {detail.ocr_error}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {detail.photos.map((p, i) => (
                    <PodLink key={i} refValue={p}
                      className="text-xs text-blue-400 underline">Photo {i + 1}</PodLink>
                  ))}
                </div>
              </div>
            )}

            {correcting && (
              <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
                <p className="text-xs text-amber-300">
                  This reverses the bill&apos;s live ledger entry and re-posts the new amount in the correction period —
                  the original entry is preserved. New total:{' '}
                  <span className="text-white font-medium">₹{previewTotal.toFixed(2)}</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Reason (required)</label>
                    <input type="text" value={correctReason} onChange={(e) => setCorrectReason(e.target.value)}
                      placeholder="e.g. vendor billed a revised rate" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Correction date (blank = today)</label>
                    <input type="date" value={correctionDate} onChange={(e) => setCorrectionDate(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              {canEdit && (
                <>
                  <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                    className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-200 rounded-xl text-sm disabled:opacity-50">
                    Save changes
                  </button>
                  <button onClick={() => rejectMutation.mutate(detail.id)} disabled={rejectMutation.isPending}
                    className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-50">
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <div className="flex-1" />
                  <button onClick={() => approveMutation.mutate(detail.id)} disabled={approveMutation.isPending}
                    className="px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                    <CheckCircle2 className="w-4 h-4" /> Approve &amp; Post
                  </button>
                </>
              )}

              {detail.status === 'posted' && !correcting && (
                <button onClick={() => setCorrecting(true)}
                  className="px-4 py-2 bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded-xl text-sm flex items-center gap-1.5">
                  <Edit className="w-4 h-4" /> Correct cost
                </button>
              )}

              {correcting && (
                <>
                  <button
                    onClick={() => {
                      setCorrecting(false); setCorrectReason(''); setCorrectionDate('');
                      if (detail) setForm((f) => ({
                        ...f,
                        qty: String(detail.qty ?? ''), unit_price: String(detail.unit_price ?? ''),
                        gst_rate: detail.gst_rate != null ? String(detail.gst_rate) : '',
                        supply_type: String(detail.supply_type ?? 1),
                        account_head_ledger_id: detail.account_head_ledger_id != null ? String(detail.account_head_ledger_id) : '',
                      }));
                    }}
                    className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-200 rounded-xl text-sm">
                    Cancel
                  </button>
                  <div className="flex-1" />
                  <button onClick={() => correctMutation.mutate()} disabled={correctMutation.isPending || !correctReason.trim()}
                    className="px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                    <CheckCircle2 className="w-4 h-4" /> Post correction
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <BulkPurchaseImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onDone={() => queryClient.invalidateQueries({ queryKey: ['accounting', 'purchases'] })}
      />
    </div>
  );
}
