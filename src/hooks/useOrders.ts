import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, POST, PUT, DELETE } from '@/lib/api';

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
            // This endpoint returns generated order list for a specific date
            const response = await GET<DeliveryItem[]>(`/get_genrated_order_list/${date}`);
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

// Delivery Report
export interface DeliveryReportItem {
    id: number;
    order_id: number;
    entry_user_id: number;
    name: string;
    s_phone: string;
    title: string;
    qty: number;
    qty_text: string;
    date: string;
    order_amount: number;
    pincode: string;
    subscription_type: number;
    order_type: number;
    mark_delivered_time_stamp: string;
    created_at: string;
}

export function useDeliveryReport(startDate: string, endDate: string, driverId?: number) {
    return useQuery({
        queryKey: ['delivery-report', startDate, endDate, driverId],
        queryFn: async () => {
            const driverPath = driverId ? `/${driverId}` : '';
            const response = await GET<DeliveryReportItem[]>(`/get_report/delivery/${startDate}/${endDate}${driverPath}`);
            return response.data || [];
        },
        enabled: !!startDate && !!endDate,
    });
}

// ==========================================
// Single Order Hooks
// ==========================================

export interface OrderDetail extends Order {
    name?: string;
    s_phone?: string;
    flat_no?: string;
    apartment_name?: string;
    area?: string;
    city?: string;
    pincode?: string;
    qty?: number;
    qty_text?: string;
    price?: number;
    mrp?: number;
    tax?: number;
    order_type: number; // 1=Prepaid, 2=Postpaid, 3=Pay Now, 4=Pay Later
    subscription_type: number | null; // 1=One Time, 2=Weekly, 3=Daily, 4=Alternative
    selected_days_for_weekly?: string;
    start_date?: string;
    address_id?: number;
    wallet_amount?: number;
}

export interface OrderAssignment {
    id: number;
    order_id: number;
    user_id: number;
    delivery_boy_name?: string;
    created_at?: string;
}

export interface SubOrderDelivery {
    id: number;
    order_id: number;
    entry_user_id: number;
    date: string;
    qty?: number;
    payment_mode?: number;
    created_at: string;
}

export interface OrderTransaction {
    id: number;
    user_id: number;
    amount: number;
    type: number;
    payment_id?: string;
    payment_mode?: number;
    description?: string;
    order_id?: number;
    created_at: string;
}

export function useOrder(id: number | string | undefined) {
    return useQuery({
        queryKey: ['order', id],
        queryFn: async () => {
            const response = await GET<OrderDetail>(`/get_order/${id}`);
            return response.data;
        },
        enabled: !!id,
    });
}

export function useOrderAssignment(orderId: number | string | undefined) {
    return useQuery({
        queryKey: ['order-assignment', orderId],
        queryFn: async () => {
            const response = await GET<OrderAssignment>(`/get_assign_user_order/order/${orderId}`);
            return response.data;
        },
        enabled: !!orderId,
    });
}

export function useOrderTransactions(orderId: number | string | undefined, isSubscription = false) {
    return useQuery({
        queryKey: ['order-transactions', orderId, isSubscription],
        queryFn: async () => {
            const endpoint = isSubscription ? `/txn/sub_order/${orderId}` : `/txn/order/${orderId}`;
            const response = await GET<OrderTransaction[]>(endpoint);
            return response.data || [];
        },
        enabled: !!orderId,
    });
}

export function useSubOrderDeliveries(orderId: number | string | undefined) {
    return useQuery({
        queryKey: ['sub-order-deliveries', orderId],
        queryFn: async () => {
            const response = await GET<SubOrderDelivery[]>(`/get_sub_order_delivery/order/${orderId}`);
            return response.data || [];
        },
        enabled: !!orderId,
    });
}

// ==========================================
// Order Mutation Hooks
// ==========================================

export function useCreateOrder() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST<{ id: number }>('/add_order', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
        },
    });
}

export function useUpdateOrder() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return PUT('/update_order', data);
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            if (variables.id) queryClient.invalidateQueries({ queryKey: ['order', variables.id] });
        },
    });
}

export function useAssignOrder() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_order_assign', data);
        },
        onSuccess: (_data, variables) => {
            if (variables.order_id) {
                queryClient.invalidateQueries({ queryKey: ['order-assignment', variables.order_id] });
            }
        },
    });
}

export function useDeleteOrderAssignment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/order_assign/delete', data);
        },
        onSuccess: (_data, variables) => {
            if (variables.order_id) {
                queryClient.invalidateQueries({ queryKey: ['order-assignment', variables.order_id] });
            }
        },
    });
}

export function useGenerateOrderList() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/genrate_order_list', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['delivery-list'] });
        },
    });
}

export function useDeletePreDeliveryList() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_pre_delivery_list', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['delivery-list'] });
        },
    });
}

export function useMarkDelivery() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/mark_delivery', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['delivery-list'] });
            queryClient.invalidateQueries({ queryKey: ['delivery-report'] });
        },
    });
}

export function useUpdatePreDelivery() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/pre_delivery_update', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['delivery-list'] });
        },
    });
}

export function useAddNormalOrderDelivery() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_normal_order_delivery', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
        },
    });
}

export function useAddSubOrderDelivery() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_sub_order_delivery/add_manually', data);
        },
        onSuccess: (_data, variables) => {
            if (variables.order_id) {
                queryClient.invalidateQueries({ queryKey: ['sub-order-deliveries', variables.order_id] });
            }
        },
    });
}

export function useAddWeeklySubOrderDelivery() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_sub_order_delivery_weekly/add_manually', data);
        },
        onSuccess: (_data, variables) => {
            if (variables.order_id) {
                queryClient.invalidateQueries({ queryKey: ['sub-order-deliveries', variables.order_id] });
            }
        },
    });
}
