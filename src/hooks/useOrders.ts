import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';

export interface Order {
    id: number;
    user_id: number;
    product_id: number;
    product_title: string;
    product_photo: string;
    order_type: number;
    status: number;
    order_status: number;
    subscription_type: number | null;
    created_at: string;
    updated_at: string;
    delivery_date: string;
    final_amount: number;
    quantity: number;
    user_name?: string;
    user_phone?: string;
    address?: string;
}

export function useOrders(date?: string) {
    return useQuery({
        queryKey: ['orders', date],
        queryFn: async () => {
            const endpoint = date
                ? `/get_order_by_date/${date}`
                : '/get_order';
            const response = await GET<Order[]>(endpoint);
            return response.data || [];
        },
    });
}

export interface DeliveryItem {
    id: number;
    order_id: number;
    user_id: number;
    product_id: number;
    product_title: string;
    qty: number;
    delivery_boy_id: number | null;
    delivery_boy_name: string | null;
    status: number;
    created_at: string;
    delivery_date: string;
    user_name?: string;
    user_phone?: string;
    address?: string;
    route?: string;
}

export function useDeliveryList(date: string) {
    return useQuery({
        queryKey: ['delivery-list', date],
        queryFn: async () => {
            const response = await GET<DeliveryItem[]>(`/get_delivery_list/${date}`);
            return response.data || [];
        },
    });
}

export interface Holiday {
    id: number;
    user_id: number;
    user_name?: string;
    from_date: string;
    to_date: string;
    status: number;
    created_at: string;
}

export function useHolidays() {
    return useQuery({
        queryKey: ['holidays'],
        queryFn: async () => {
            const response = await GET<Holiday[]>('/get_holidays');
            return response.data || [];
        },
    });
}

export interface CalendarOrder extends Order {
    qty: number;
}

export function useCalendarOrders(date: string) {
    return useQuery({
        queryKey: ['calendar-orders', date],
        queryFn: async () => {
            const response = await GET<CalendarOrder[]>(`/orders_for_calendar/${date}`);
            return response.data || [];
        },
    });
}
