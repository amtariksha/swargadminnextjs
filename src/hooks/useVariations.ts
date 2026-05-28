/**
 * TanStack Query hooks for the Product Variations feature.
 *
 * Endpoint contracts: see swargnodejsbackend/src/routes/{attributes,variants,
 * storefront,notify,costPrices}.js and the controllers they wire up.
 *
 * Query key conventions:
 *   ['attributes']                          — global attribute library
 *   ['attribute', id]                       — one attribute (+ values)
 *   ['product-attributes', productId]       — product's attribute assignments
 *   ['variants', productId]                 — product's variants
 *   ['variant', productId, variantId]       — one variant
 *   ['notify-requests', filters]            — pending notify-me list
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, POST, PUT, PATCH, DELETE } from '@/lib/api';
import type {
    Attribute,
    AttributeValue,
    Variant,
    ProductAttributeAssignment,
    VariantCreatePayload,
    VariantGeneratePayload,
    VariantGenerateResult,
    NotifyRequest,
} from '@/lib/types/variations';

/* ───────────────────────────────────────────────────────────────────────
 * Attribute library
 * ─────────────────────────────────────────────────────────────────────── */

export function useAttributes(options: { includeValues?: boolean } = {}) {
    return useQuery({
        queryKey: ['attributes', options.includeValues ?? false],
        queryFn: async () => {
            const res = await GET<Attribute[]>('/attributes', options.includeValues ? { include_values: '1' } : undefined);
            return res.data || [];
        },
    });
}

export function useAttribute(id: number | null | undefined) {
    return useQuery({
        queryKey: ['attribute', id],
        enabled: id != null,
        queryFn: async () => {
            const res = await GET<Attribute>(`/attributes/${id}`);
            return res.data;
        },
    });
}

export function useCreateAttribute() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<Attribute> & { values?: Partial<AttributeValue>[] }) => {
            const res = await POST<Attribute>('/attributes', payload as Record<string, unknown>);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['attributes'] }),
    });
}

export function useUpdateAttribute() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...changes }: Partial<Attribute> & { id: number }) => {
            const res = await PATCH<Attribute>(`/attributes/${id}`, changes as Record<string, unknown>);
            return res.data;
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['attributes'] });
            qc.invalidateQueries({ queryKey: ['attribute', vars.id] });
        },
    });
}

export function useDeleteAttribute() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => {
            await DELETE(`/attributes/${id}`);
            return id;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['attributes'] }),
    });
}

export function useAddAttributeValue() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ attributeId, ...payload }: Partial<AttributeValue> & { attributeId: number }) => {
            const res = await POST<AttributeValue[]>(`/attributes/${attributeId}/values`, payload as Record<string, unknown>);
            return res.data;
        },
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ['attribute', vars.attributeId] });
            qc.invalidateQueries({ queryKey: ['attributes'] });
        },
    });
}

export function useUpdateAttributeValue() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ attributeId, valueId, ...changes }: Partial<AttributeValue> & { attributeId: number; valueId: number }) => {
            const res = await PATCH<AttributeValue>(`/attributes/${attributeId}/values/${valueId}`, changes as Record<string, unknown>);
            return res.data;
        },
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ['attribute', vars.attributeId] });
        },
    });
}

export function useArchiveAttributeValue() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ attributeId, valueId }: { attributeId: number; valueId: number }) => {
            await DELETE(`/attributes/${attributeId}/values/${valueId}`);
            return { attributeId, valueId };
        },
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ['attribute', vars.attributeId] });
        },
    });
}

/* ───────────────────────────────────────────────────────────────────────
 * Product attribute assignment
 * ─────────────────────────────────────────────────────────────────────── */

export function useProductAttributes(productId: number | null | undefined) {
    return useQuery({
        queryKey: ['product-attributes', productId],
        enabled: productId != null,
        queryFn: async () => {
            const res = await GET<ProductAttributeAssignment[]>(`/products/${productId}/attributes`);
            return res.data || [];
        },
    });
}

export function useSetProductAttributes() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ productId, payload }: { productId: number; payload: Array<{ attribute_id: number; is_variation_defining?: boolean; is_visible?: boolean; value_ids: number[] }> }) => {
            const res = await PUT<ProductAttributeAssignment[]>(`/products/${productId}/attributes`, payload as unknown as Record<string, unknown>);
            return res.data;
        },
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ['product-attributes', vars.productId] });
            qc.invalidateQueries({ queryKey: ['variants', vars.productId] });
        },
    });
}

/* ───────────────────────────────────────────────────────────────────────
 * Variants
 * ─────────────────────────────────────────────────────────────────────── */

export function useVariants(productId: number | null | undefined, includeArchived = false) {
    return useQuery({
        queryKey: ['variants', productId, includeArchived],
        enabled: productId != null,
        queryFn: async () => {
            const res = await GET<Variant[]>(
                `/products/${productId}/variants`,
                includeArchived ? { include_archived: '1' } : undefined,
            );
            return res.data || [];
        },
    });
}

export function useCreateVariant() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ productId, payload }: { productId: number; payload: VariantCreatePayload }) => {
            const res = await POST<Variant>(`/products/${productId}/variants`, payload as unknown as Record<string, unknown>);
            return res.data;
        },
        onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['variants', vars.productId] }),
    });
}

export function useGenerateVariants() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ productId, payload }: { productId: number; payload: VariantGeneratePayload }) => {
            const res = await POST<VariantGenerateResult>(
                `/products/${productId}/variants/generate`,
                payload as unknown as Record<string, unknown>,
            );
            return res.data;
        },
        onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['variants', vars.productId] }),
    });
}

export function useUpdateVariant() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ productId, variantId, ...changes }: Partial<Variant> & { productId: number; variantId: number }) => {
            const res = await PATCH<Variant>(`/products/${productId}/variants/${variantId}`, changes as Record<string, unknown>);
            return res.data;
        },
        onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['variants', vars.productId] }),
    });
}

export function useArchiveVariant() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ productId, variantId }: { productId: number; variantId: number }) => {
            await DELETE(`/products/${productId}/variants/${variantId}`);
            return { productId, variantId };
        },
        onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['variants', vars.productId] }),
    });
}

export function useBulkEditVariants() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ productId, variant_ids, filter, changes }: {
            productId: number;
            variant_ids?: number[];
            filter?: { attribute_value_id?: number };
            changes: Record<string, unknown>;
        }) => {
            const res = await POST<{ updated: number; variant_ids: number[] }>(
                `/products/${productId}/variants/bulk-edit`,
                { variant_ids, filter, changes } as Record<string, unknown>,
            );
            return res.data;
        },
        onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['variants', vars.productId] }),
    });
}

/* ───────────────────────────────────────────────────────────────────────
 * Notify requests (admin list)
 * ─────────────────────────────────────────────────────────────────────── */

export function useNotifyRequests(filters: { product_id?: number; variant_id?: number; pending?: boolean } = {}) {
    return useQuery({
        queryKey: ['notify-requests', filters],
        queryFn: async () => {
            const params: Record<string, unknown> = {};
            if (filters.product_id != null) params.product_id = filters.product_id;
            if (filters.variant_id != null) params.variant_id = filters.variant_id;
            if (filters.pending) params.pending = '1';
            const res = await GET<NotifyRequest[]>('/notify-requests', params);
            return res.data || [];
        },
    });
}

/* ───────────────────────────────────────────────────────────────────────
 * Cost-price feeder
 * ─────────────────────────────────────────────────────────────────────── */

export function useUpdateCostPrices() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (items: Array<{ product_id?: number; variant_id?: number; cost_price: number | null }>) => {
            const res = await PATCH<{
                products_updated: number;
                variants_updated: number;
                items_skipped: number;
                errors: Array<{ item: unknown; error: string }>;
            }>('/cost-prices', { items });
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products'] });
            qc.invalidateQueries({ queryKey: ['variants'] });
        },
    });
}
