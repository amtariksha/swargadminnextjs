/**
 * TanStack Query hooks for the Phase I currency + warehouse foundations.
 *
 * Backend lives at /api/currencies and /api/warehouses (migration 034 /
 * Phase I). No application code consumes these tables yet — the hooks
 * exist so the admin can seed rows ahead of the future multi-region
 * project. PRD §2.2 lists both as explicit non-goals.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, POST, PATCH, DELETE } from '@/lib/api';

export interface Currency {
    id: number;
    code: string;
    symbol: string;
    name: string;
    exchange_rate_to_inr: number;
    is_active: number;
    is_default: number;
    created_at?: string;
    updated_at?: string;
}

export interface Warehouse {
    id: number;
    code: string;
    name: string;
    address: string | null;
    city: string | null;
    pincode: string | null;
    lat: number | null;
    lng: number | null;
    is_active: number;
    is_primary: number;
    created_at?: string;
    updated_at?: string;
}

/* ─────── Currency ─────── */

export function useCurrencies() {
    return useQuery({
        queryKey: ['currencies'],
        queryFn: async () => {
            const res = await GET<Currency[]>('/currencies');
            return res.data || [];
        },
    });
}

export function useCreateCurrency() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<Currency>) => {
            const res = await POST<Currency>('/currencies', payload as Record<string, unknown>);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['currencies'] }),
    });
}

export function useUpdateCurrency() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...changes }: Partial<Currency> & { id: number }) => {
            const res = await PATCH<Currency>(`/currencies/${id}`, changes as Record<string, unknown>);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['currencies'] }),
    });
}

export function useDeleteCurrency() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => {
            await DELETE(`/currencies/${id}`);
            return id;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['currencies'] }),
    });
}

/* ─────── Warehouse ─────── */

export function useWarehouses() {
    return useQuery({
        queryKey: ['warehouses'],
        queryFn: async () => {
            const res = await GET<Warehouse[]>('/warehouses');
            return res.data || [];
        },
    });
}

export function useCreateWarehouse() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<Warehouse>) => {
            const res = await POST<Warehouse>('/warehouses', payload as Record<string, unknown>);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
    });
}

export function useUpdateWarehouse() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...changes }: Partial<Warehouse> & { id: number }) => {
            const res = await PATCH<Warehouse>(`/warehouses/${id}`, changes as Record<string, unknown>);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
    });
}

export function useDeleteWarehouse() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => {
            await DELETE(`/warehouses/${id}`);
            return id;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
    });
}
