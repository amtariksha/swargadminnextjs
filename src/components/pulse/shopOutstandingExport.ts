/**
 * Shop Outstanding — CSV and print versions in the same shape as the
 * operator's manual sheet: S.No | Shop Name | <date> … | Total Outstanding.
 */

import type { ShopOutstandingRow } from '@/hooks/usePulse';

/** 'YYYY-MM-DD' → 'DD-MM-YYYY' (the sheet's format). */
export const ddmmyyyy = (iso: string): string => {
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return d && m && y ? `${d}-${m}-${y}` : iso;
};

/** Indian grouping; paise only when there are any (the sheet shows whole rupees). */
const amount = (n: number): string =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const totalAmount = (n: number): string =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const csvCell = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function shopOutstandingCsv(rows: ShopOutstandingRow[], total: number, asOf: string): string {
    const lines = [
        ['S.No', 'Shop Name', `Outstanding as of ${ddmmyyyy(asOf)}`],
        ...rows.map((r) => [r.s_no, r.name, r.balance.toFixed(2)]),
        ['', 'Total Outstanding', total.toFixed(2)],
    ];
    return lines.map((cols) => cols.map(csvCell).join(',')).join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Open a print-ready copy of the sheet in a new window (Save as PDF works too). */
export function printShopOutstanding(rows: ShopOutstandingRow[], total: number, asOf: string): void {
    const win = window.open('', '_blank');
    if (!win) return;
    const date = ddmmyyyy(asOf);
    const body = rows.map((r) => `
        <tr><td class="c">${r.s_no}</td><td>${escapeHtml(r.name)}</td><td class="r">${amount(r.balance)}</td></tr>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>Shop Outstanding ${date}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; margin: 24px; color: #000; }
  table { border-collapse: collapse; min-width: 480px; }
  th, td { border: 1px solid #000; padding: 4px 10px; font-size: 15px; }
  th { font-weight: 700; }
  .title { text-align: center; font-size: 18px; }
  .c { text-align: center; } .r { text-align: right; }
  tfoot td { font-weight: 700; }
</style></head><body>
<table>
  <thead>
    <tr><th class="title" colspan="3">Shop Outstanding</th></tr>
    <tr><th>S.No</th><th>Shop Name</th><th>${date}</th></tr>
  </thead>
  <tbody>${body}</tbody>
  <tfoot><tr><td></td><td class="r">Total Outstanding</td><td class="r">${totalAmount(total)}</td></tr></tfoot>
</table>
<script>window.onload = () => window.print();</script>
</body></html>`);
    win.document.close();
}
