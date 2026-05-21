/**
 * Inventory data hooks (Feature 11) — vendors, raw materials, purchases,
 * payments, vendor ledger, purchase report.
 *
 * Numeric DB columns (NUMERIC) arrive as strings from the Postgres driver;
 * fields below are typed `number | string` — use Number(...) before maths.
 */

import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';

export interface Vendor {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
  opening_balance: number | string;
  is_active: number;
  notes?: string | null;
  outstanding?: number | string;
  created_at?: string;
  updated_at?: string;
}

export interface RawMaterial {
  id: number;
  name: string;
  unit: string;
  current_stock: number | string;
  is_active: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseEntry {
  id: number;
  vendor_id: number;
  raw_material_id: number;
  purchase_date: string;
  invoice_no?: string | null;
  qty: number | string;
  unit_price: number | string;
  total_amount: number | string;
  notes?: string | null;
  vendor_name?: string;
  raw_material_name?: string;
  raw_material_unit?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VendorPayment {
  id: number;
  vendor_id: number;
  payment_date: string;
  amount: number | string;
  payment_mode: string;
  reference_no?: string | null;
  notes?: string | null;
  vendor_name?: string;
  created_at?: string;
}

export interface LedgerEntry {
  entry_type: 'purchase' | 'payment';
  ref_id: number;
  entry_date: string;
  amount: number | string;
  reference?: string | null;
  detail?: string | null;
  notes?: string | null;
  balance: number;
}

export interface VendorLedger {
  vendor: { id: number; name: string };
  opening_balance: number;
  closing_balance: number;
  entries: LedgerEntry[];
}

export interface PurchaseReport {
  summary: { entry_count: number; total_qty: number | string; total_amount: number | string };
  by_vendor: Array<{ vendor_id: number; vendor_name: string; entry_count: number; total_amount: number | string }>;
  by_raw_material: Array<{
    raw_material_id: number; raw_material_name: string; raw_material_unit: string;
    entry_count: number; total_qty: number | string; total_amount: number | string;
  }>;
}

export function useVendors() {
  return useQuery({
    queryKey: ['inventory', 'vendors'],
    queryFn: async () => (await GET<Vendor[]>('/inventory/vendors')).data || [],
  });
}

export function useRawMaterials() {
  return useQuery({
    queryKey: ['inventory', 'raw-materials'],
    queryFn: async () => (await GET<RawMaterial[]>('/inventory/raw-materials')).data || [],
  });
}

export function usePurchaseEntries() {
  return useQuery({
    queryKey: ['inventory', 'purchases'],
    queryFn: async () => (await GET<PurchaseEntry[]>('/inventory/purchases')).data || [],
  });
}

export function useVendorPayments() {
  return useQuery({
    queryKey: ['inventory', 'payments'],
    queryFn: async () => (await GET<VendorPayment[]>('/inventory/payments')).data || [],
  });
}

export function useVendorLedger(vendorId: number | null) {
  return useQuery({
    queryKey: ['inventory', 'vendor-ledger', vendorId],
    queryFn: async () => (await GET<VendorLedger>(`/inventory/vendors/${vendorId}/ledger`)).data,
    enabled: vendorId != null,
  });
}

export function usePurchaseReport(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['inventory', 'purchase-report', filters],
    queryFn: async () => (await GET<PurchaseReport>('/inventory/purchase-report', filters)).data,
  });
}
