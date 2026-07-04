/**
 * Business-pulse hooks (Phase 5 — Ops Pulse).
 *
 * Thin TanStack Query wrappers over the backend /pulse/* + /production/
 * demand-forecast endpoints (v_pulse_* views, migration 101). Numeric
 * columns arrive as strings from Postgres — every consumer coerces with
 * Number() at render time.
 */

import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';

const PULSE_STALE_MS = 5 * 60 * 1000; // nightly-fresh data; 5 min is plenty

type Numeric = number | string;

export interface PulseRevenueMonth {
    month: string;
    b2c_delivered_value: Numeric;
    b2b_delivered_value: Numeric;
    daytime_value: Numeric;
    total_value: Numeric;
    wallet_topups: Numeric;
    wallet_debits: Numeric;
    mom_pct: number | null;
}

export interface PulseSubscriptionMonth {
    month: string;
    active_subs: Numeric;
    new_subs: Numeric;
    churned_subs: Numeric;
    started_subs: Numeric;
    churn_pct: number | null;
    month_in_progress: boolean;
}

export interface PulseWastageProductionDay {
    day: string;
    produced_qty: Numeric | null;
    production_wastage_qty: Numeric | null;
    production_wastage_pct: Numeric | null;
}

export interface PulseWastagePackingDay {
    day: string;
    packed_qty: Numeric | null;          // NULL = not logged (sparse parallel log)
    packing_wastage_qty: Numeric | null;
    delivered_qty: Numeric | null;
    delivered_vs_packed_pct: Numeric | null;
    packing_wastage_pct: Numeric | null;
}

export interface PulseDriverSummary {
    driver_id: number;
    driver_name: string;
    days_worked: number;
    total_stops: number;
    delivered_stops: number;
    not_delivered_stops: number;
    total_qty: number;
    avg_stops_per_day: number;
    delivered_rate_pct: number | null;
    avg_window_minutes: number | null;
}

export interface PulseVendorVarianceEntry {
    purchase_entry_id: number;
    vendor_id: number;
    vendor_name: string;
    raw_material_id: number;
    material_name: string;
    material_unit: string;
    purchase_date: string;
    qty: Numeric;
    unit_price: Numeric;
    total_amount: Numeric;
    vendor_avg_90d: Numeric | null;
    market_avg_90d: Numeric | null;
    fat_value: Numeric | null;
    contract_price: Numeric | null;
    vs_vendor_avg_pct: Numeric | null;
    vs_market_avg_pct: Numeric | null;
}

export interface DemandForecastProduct {
    product_id: number;
    product_title: string;
    forecast_qty: Numeric;
    avg_daily_28: Numeric;
    dow_factor: Numeric | null;
    days_with_data: number;
    low_confidence: boolean;
}

export function usePulseRevenue(months: number) {
    return useQuery({
        queryKey: ['pulse', 'revenue', months],
        queryFn: async () =>
            (await GET<{ months: PulseRevenueMonth[] }>('/pulse/revenue', { months })).data,
        staleTime: PULSE_STALE_MS,
    });
}

export function usePulseSubscriptions(months: number) {
    return useQuery({
        queryKey: ['pulse', 'subscriptions', months],
        queryFn: async () =>
            (await GET<{ months: PulseSubscriptionMonth[] }>('/pulse/subscriptions', { months })).data,
        staleTime: PULSE_STALE_MS,
    });
}

export function usePulseWastage(from: string, to: string) {
    return useQuery({
        queryKey: ['pulse', 'wastage', from, to],
        queryFn: async () =>
            (await GET<{
                from: string; to: string;
                production: PulseWastageProductionDay[];
                packing: PulseWastagePackingDay[];
            }>('/pulse/wastage', { from, to })).data,
        staleTime: PULSE_STALE_MS,
    });
}

export function usePulseDrivers(from: string, to: string) {
    return useQuery({
        queryKey: ['pulse', 'drivers', from, to],
        queryFn: async () =>
            (await GET<{ from: string; to: string; drivers: PulseDriverSummary[] }>(
                '/pulse/drivers', { from, to },
            )).data,
        staleTime: PULSE_STALE_MS,
    });
}

export function usePulseVendorVariance(days: number) {
    return useQuery({
        queryKey: ['pulse', 'vendor-variance', days],
        queryFn: async () =>
            (await GET<{ days: number; entries: PulseVendorVarianceEntry[]; note: string }>(
                '/pulse/vendor-variance', { days },
            )).data,
        staleTime: PULSE_STALE_MS,
    });
}

/** Per-product forecast for a date's weekday (default: tomorrow IST). */
export function useDemandForecast(date?: string) {
    return useQuery({
        queryKey: ['pulse', 'demand-forecast', date ?? 'tomorrow'],
        queryFn: async () =>
            (await GET<{ date: string; dow: number; products: DemandForecastProduct[] }>(
                '/production/demand-forecast', date ? { date } : undefined,
            )).data,
        staleTime: PULSE_STALE_MS,
    });
}
