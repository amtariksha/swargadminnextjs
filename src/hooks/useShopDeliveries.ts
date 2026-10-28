import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import type { ShopDeliveriesMeta, ShopStop } from '@/lib/shopBilling';

export const shopDeliveriesKey = (date: string) => ['shop-delivery-list', date] as const;

/** The day's B2B shop stops with their bills and Tally state. */
export function useShopDeliveries(date: string) {
    return useQuery({
        queryKey: shopDeliveriesKey(date),
        queryFn: async () => {
            const response = await GET<ShopStop[]>(`/get_shop_delivery_list/${date}`);
            // meta sits beside data in the envelope; GET's type only names data.
            const meta = (response as { meta?: ShopDeliveriesMeta }).meta;
            return {
                shops: response.data || [],
                meta: meta ?? { accounting_enabled: false, tally_posting_enabled: false },
            };
        },
    });
}

/** Invoice the day's delivered shop lines that have no invoice yet. */
export function useBillShopDeliveries(date: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => POST<{ checked: number; created: number }>(`/shop_delivery_list/${date}/bill`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: shopDeliveriesKey(date) }),
    });
}

/** Hand a shop's undelivered truck lines to the day pool (billed by invoice, no wallet). */
export function useSendShopToDay(date: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (userId: number) => POST<{ lines?: number }>('/daytime/from_shop', { user_id: userId, date }),
        onSettled: () => queryClient.invalidateQueries({ queryKey: shopDeliveriesKey(date) }),
    });
}
