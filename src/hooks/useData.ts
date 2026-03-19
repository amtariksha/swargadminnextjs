import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, POST, PUT, DELETE } from '@/lib/api';

// Users
export interface User {
    id: number;
    name: string;
    email: string;
    phone: string;
    photo?: string;
    address?: string;
    pincode?: string;
    wallet_amount: number;
    status: number;
    created_at: string;
}

export function useUsers() {
    return useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const response = await GET<User[]>('/get_user');
            return response.data || [];
        },
    });
}

// Drivers
export interface Driver {
    id: number;
    name: string;
    email: string;
    phone: string;
    photo?: string;
    address?: string;
    vehicle_number?: string;
    status: number;
    created_at: string;
}

export function useDrivers() {
    return useQuery({
        queryKey: ['drivers'],
        queryFn: async () => {
            // Role 4 = Delivery Partners
            const response = await GET<Driver[]>('/get_user/role/4');
            return response.data || [];
        },
    });
}

// Categories
export interface Category {
    id: number;
    title: string;
    photo?: string;
    status: number;
    created_at: string;
}

export function useCategories() {
    return useQuery({
        queryKey: ['categories'],
        queryFn: async () => {
            const response = await GET<Category[]>('/get_category');
            return response.data || [];
        },
    });
}

// Subcategories
export interface Subcategory {
    id: number;
    title: string;
    category_id: number;
    category_title?: string;
    photo?: string;
    status: number;
    created_at: string;
}

export function useSubcategories() {
    return useQuery({
        queryKey: ['subcategories'],
        queryFn: async () => {
            const response = await GET<Subcategory[]>('/get_subcategory');
            return response.data || [];
        },
    });
}

// Products
export interface Product {
    id: number;
    title: string;
    preferences?: number;
    qty_text?: string;
    stock_qty?: number;
    sub_cat_id?: number;
    price: number;
    mrp?: number;
    tax?: number;
    offer_text?: string;
    description?: string;
    disclaimer?: string;
    subscription?: number;
    is_active?: number;
    cat_id?: number;
    cat_title?: string;
    sub_cat_title?: string;
    image_id?: number | null;
    image?: string | null;
    created_at: string;
    updated_at?: string;
    // Legacy aliases (some pages may still use these)
    photo?: string;
    discount_price?: number;
    unit?: string;
    stock?: number;
    status?: number;
    category_id?: number;
    subcategory_id?: number;
}

export function useProducts() {
    return useQuery({
        queryKey: ['products'],
        queryFn: async () => {
            const response = await GET<Product[]>('/get_product');
            return response.data || [];
        },
    });
}

// Transactions
export interface Transaction {
    id: number;
    user_id: number;
    user_name?: string;
    amount: number;
    type: string;
    payment_method?: string;
    status: number;
    created_at: string;
}

export function useTransactions() {
    return useQuery({
        queryKey: ['transactions'],
        queryFn: async () => {
            const response = await GET<Transaction[]>('/get_transaction');
            return response.data || [];
        },
    });
}

// Banners
export interface Banner {
    id: number;
    image: string;
    image_type?: number;
    created_at?: string;
}

export function useBanners() {
    return useQuery({
        queryKey: ['banners'],
        queryFn: async () => {
            // Mobile banners endpoint from React admin
            const response = await GET<Banner[]>('/get_banner/mobile');
            return response.data || [];
        },
    });
}

// Testimonials
export interface Testimonial {
    id: number;
    name: string;
    designation?: string;
    message: string;
    photo?: string;
    rating: number;
    status: number;
}

export function useTestimonials() {
    return useQuery({
        queryKey: ['testimonials'],
        queryFn: async () => {
            const response = await GET<Testimonial[]>('/get_testimonial');
            return response.data || [];
        },
    });
}

// Pincodes - API uses pin_code field
export interface Pincode {
    id: number;
    pin_code: string;  // API field name
    created_at?: string;
    updated_at?: string;
}

export function usePincodes() {
    return useQuery({
        queryKey: ['pincodes'],
        queryFn: async () => {
            const response = await GET<Pincode[]>('/get_pincode');
            return response.data || [];
        },
    });
}

// Delivery Locations - Available delivery locations
export interface DeliveryLocation {
    id: number;
    title: string;  // API field name
    created_at?: string;
    updated_at?: string;
}

export function useDeliveryLocations() {
    return useQuery({
        queryKey: ['delivery-locations'],
        queryFn: async () => {
            // Correct endpoint from React admin
            const response = await GET<DeliveryLocation[]>('/get_available_delivery_location');
            return response.data || [];
        },
    });
}

// User Holidays
export interface Holiday {
    id: number;
    user_id: number;
    name: string;
    phone: string;
    date: string;
    created_at?: string;
    updated_at?: string;
}

export function useHolidays() {
    return useQuery({
        queryKey: ['holidays'],
        queryFn: async () => {
            const response = await GET<Holiday[]>('/get_users_holiday');
            return response.data || [];
        },
    });
}

// Upcoming Orders (Normal)
export interface UpcomingOrder {
    id: number;
    user_id: number;
    name: string;
    s_phone: string;
    title: string;
    qty: number;
    qty_text: string;
    delivery_boy_name?: string;
    delivery_status?: number;
    flat_no?: string;
    apartment_name?: string;
    area?: string;
    city?: string;
    pincode?: string;
    order_type?: number;
    created_at: string;
}

export function useUpcomingOrders() {
    return useQuery({
        queryKey: ['upcoming-orders'],
        queryFn: async () => {
            const response = await GET<UpcomingOrder[]>('/get_upcoming_delivery/normal');
            return response.data || [];
        },
    });
}

// Settings
export interface Settings {
    id: number;
    key: string;
    value: string;
    type?: string;
}

export function useSettings() {
    return useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const response = await GET<Settings[]>('/get_setting');
            return response.data || [];
        },
    });
}

// ==========================================
// Extended Interfaces
// ==========================================

export interface UserDetail extends User {
    flat_no?: string;
    apartment_name?: string;
    area?: string;
    city?: string;
    landmark?: string;
    lat?: string;
    lng?: string;
    role?: Array<{ id: number; role_id: number; role_title: string }>;
    updated_at?: string;
}

export interface Address {
    id: number;
    user_id: number;
    name: string;
    s_phone: string;
    flat_no: string;
    apartment_name: string;
    area: string;
    landmark?: string;
    city: string;
    pincode: string;
    lat?: string;
    lng?: string;
    created_at?: string;
}

export interface UserTransaction {
    id: number;
    user_id: number;
    amount: number;
    type: number; // 1=credit, 2=debit
    payment_id?: string;
    payment_mode?: number; // 1=Online, 2=Cash
    description?: string;
    order_id?: number;
    log_type?: string;
    name?: string;
    phone?: string;
    pre_tx_wallet_balance?: number;
    updated_wallet_balance?: number;
    created_at: string;
    updated_at?: string;
}

export interface UserHoliday {
    id: number;
    user_id: number;
    date: string;
    name?: string;
    phone?: string;
    created_at?: string;
}

export interface ProductDetail extends Product {
    qty_text?: string;
    mrp?: number;
    tax?: number;
    stock_qty?: number;
    subscription?: number;
    sub_cat_id?: number;
    offer_text?: string;
    disclaimer?: string;
    images?: Array<{ id: number; image: string; image_type?: number }>;
    updated_at?: string;
}

export interface UpcomingSubOrder {
    id: number;
    user_id: number;
    order_type: number;
    order_amount: number;
    qty: number;
    selected_days_for_weekly?: string;
    subscription_type: number;
    start_date: string;
    title: string;
    product_image?: string;
    qty_text: string;
    name: string;
    s_phone: string;
    flat_no?: string;
    apartment_name?: string;
    area?: string;
    city?: string;
    pincode?: number;
    wallet_amount?: number;
    delivery_boy_name?: string;
    order_user_assign_id?: number;
    order_assign_user?: number;
    delivered_date?: string;
    user_holiday?: Array<{ date: string; created_at: string }>;
    created_at: string;
    updated_at?: string;
}

export interface WebPage {
    id: number;
    page: string;
    title?: string;
    content?: string;
    created_at?: string;
    updated_at?: string;
}

export interface InvoiceSettings {
    id: number;
    key: string;
    value: string;
}

export interface PaymentGateway {
    id: number;
    key: string;
    value: string;
}

export interface SocialMedia {
    id: number;
    platform: string;
    url: string;
    created_at?: string;
}

export interface Notification {
    id: number;
    title: string;
    message: string;
    user_id?: number;
    created_at?: string;
}

// ==========================================
// Single Entity Query Hooks
// ==========================================

export function useUser(id: number | string | undefined) {
    return useQuery({
        queryKey: ['user', id],
        queryFn: async () => {
            const response = await GET<UserDetail>(`/get_user/${id}`);
            return response.data;
        },
        enabled: !!id,
    });
}

export function useProduct(id: number | string | undefined) {
    return useQuery({
        queryKey: ['product', id],
        queryFn: async () => {
            const response = await GET<ProductDetail>(`/get_product/${id}`);
            return response.data;
        },
        enabled: !!id,
    });
}

// ==========================================
// User-Scoped Query Hooks
// ==========================================

export function useUserOrders(userId: number | string | undefined) {
    return useQuery({
        queryKey: ['user-orders', userId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await GET<any[]>(`/get_order/user/${userId}`);
            return response.data || [];
        },
        enabled: !!userId,
    });
}

export function useUserTransactions(userId: number | string | undefined) {
    return useQuery({
        queryKey: ['user-transactions', userId],
        queryFn: async () => {
            const response = await GET<UserTransaction[]>(`/txn/user/${userId}`);
            return response.data || [];
        },
        enabled: !!userId,
    });
}

export function useUserHolidays(userId: number | string | undefined) {
    return useQuery({
        queryKey: ['user-holidays', userId],
        queryFn: async () => {
            const response = await GET<UserHoliday[]>(`/get_user_holiday/user/${userId}`);
            return response.data || [];
        },
        enabled: !!userId,
    });
}

export function useUserAddresses(userId: number | string | undefined) {
    return useQuery({
        queryKey: ['user-addresses', userId],
        queryFn: async () => {
            const response = await GET<Address[]>(`/address/user/${userId}`);
            return response.data || [];
        },
        enabled: !!userId,
    });
}

export function useUserDeliveryHistory(userId: number | string | undefined) {
    return useQuery({
        queryKey: ['user-delivery-history', userId],
        queryFn: async () => {
            const response = await GET<import('./useOrders').DeliveryReportItem[]>(
                `/get_sub_order_delivery_by_user/${userId}`
            );
            return response.data || [];
        },
        enabled: !!userId,
    });
}

export function useUserCalendar(userId: number | string | undefined, month: string) {
    return useQuery({
        queryKey: ['user-calendar', userId, month],
        queryFn: async () => {
            const response = await GET<Record<string, unknown>[]>(`/get_order_calender/${userId}/${month}`);
            return response.data || [];
        },
        enabled: !!userId && !!month,
    });
}

// ==========================================
// Date-Filtered Query Hooks
// ==========================================

export function useTransactionsByDateRange(startDate: string, endDate: string) {
    return useQuery({
        queryKey: ['transactions-range', startDate, endDate],
        queryFn: async () => {
            const response = await GET<UserTransaction[]>(`/txn/by_date_range/${startDate}/${endDate}`);
            return response.data || [];
        },
        enabled: !!startDate && !!endDate,
    });
}

export function useUpcomingSubOrders(date: string) {
    return useQuery({
        queryKey: ['upcoming-sub-orders', date],
        queryFn: async () => {
            const response = await GET<UpcomingSubOrder[]>(`/get_upcoming_delivery/sub_date/${date}`);
            return response.data || [];
        },
        enabled: !!date,
    });
}

export function useUpcomingSubOrdersByDriver(driverId: number | string | undefined, date: string) {
    return useQuery({
        queryKey: ['upcoming-sub-orders-driver', driverId, date],
        queryFn: async () => {
            const response = await GET<UpcomingSubOrder[]>(
                `/get_upcoming_delivery/sub_date/assign_user/${driverId}/${date}`
            );
            return response.data || [];
        },
        enabled: !!driverId && !!date,
    });
}

// ==========================================
// Content & Settings Hooks
// ==========================================

export function useWebPage(slug: string) {
    return useQuery({
        queryKey: ['web-page', slug],
        queryFn: async () => {
            const response = await GET<WebPage>(`/get_web_page/page/${slug}`);
            return response.data;
        },
        enabled: !!slug,
    });
}

export function useInvoiceSettings() {
    return useQuery({
        queryKey: ['invoice-settings'],
        queryFn: async () => {
            const response = await GET<InvoiceSettings[]>('/get_invoice_settings');
            return response.data || [];
        },
    });
}

export function usePaymentGateway() {
    return useQuery({
        queryKey: ['payment-gateway'],
        queryFn: async () => {
            const response = await GET<PaymentGateway[]>('/get_payment_getway');
            return response.data || [];
        },
    });
}

export function useSocialMedia() {
    return useQuery({
        queryKey: ['social-media'],
        queryFn: async () => {
            const response = await GET<SocialMedia[]>('/get_social_media');
            return response.data || [];
        },
    });
}

export function useNotifications() {
    return useQuery({
        queryKey: ['notifications'],
        queryFn: async () => {
            const response = await GET<Notification[]>('/get_user_notification');
            return response.data || [];
        },
    });
}

// ==========================================
// Mutation Hooks
// ==========================================

export function useCreateUser() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_user', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
}

export function useUpdateUser() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/update_user', data);
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['user', variables.id] });
        },
    });
}

export function useCreateProduct() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown> | FormData) => {
            return POST('/add_product', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
        },
    });
}

export function useUpdateProduct() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown> | FormData) => {
            return POST('/update_product', data);
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            const id = variables instanceof FormData ? variables.get('id') : variables.id;
            if (id) queryClient.invalidateQueries({ queryKey: ['product', id] });
        },
    });
}

export function useDeleteProduct() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_product', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
        },
    });
}

export function useUploadProductImage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: FormData) => {
            return POST('/product/upload_image', data);
        },
        onSuccess: (_data, variables) => {
            const id = variables.get('id');
            if (id) queryClient.invalidateQueries({ queryKey: ['product', id] });
        },
    });
}

export function useDeleteProductImage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/product/delete_image', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
        },
    });
}

export function useCreateCategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown> | FormData) => {
            return POST('/add_cat', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
        },
    });
}

export function useUpdateCategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown> | FormData) => {
            return POST('/update_cat', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
        },
    });
}

export function useDeleteCategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_cat', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
        },
    });
}

export function useUploadCategoryImage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: FormData) => {
            return POST('/cat/upload_image', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
        },
    });
}

export function useCreateSubcategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown> | FormData) => {
            return POST('/add_sub_cat', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subcategories'] });
        },
    });
}

export function useUpdateSubcategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown> | FormData) => {
            return POST('/update_sub_cat', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subcategories'] });
        },
    });
}

export function useDeleteSubcategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_sub_cat', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subcategories'] });
        },
    });
}

export function useUploadSubcategoryImage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: FormData) => {
            return POST('/sub_cat/upload_image', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subcategories'] });
        },
    });
}

export function useAddTransaction() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_txn', data);
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            if (variables.user_id) {
                const uid = String(variables.user_id);
                queryClient.invalidateQueries({ queryKey: ['user-transactions', uid] });
                queryClient.invalidateQueries({ queryKey: ['user-transactions', Number(variables.user_id)] });
                queryClient.invalidateQueries({ queryKey: ['user', uid] });
                queryClient.invalidateQueries({ queryKey: ['user', Number(variables.user_id)] });
                queryClient.invalidateQueries({ queryKey: ['users'] });
            }
        },
    });
}

export function useAddHoliday() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_user_holiday_multiple', data);
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['holidays'] });
            if (variables.user_id) {
                queryClient.invalidateQueries({ queryKey: ['user-holidays', variables.user_id] });
            }
        },
    });
}

export function useDeleteHoliday() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_user_holiday', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['holidays'] });
        },
    });
}

export function useAddAddress() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_address', data);
        },
        onSuccess: (_data, variables) => {
            if (variables.user_id) {
                queryClient.invalidateQueries({ queryKey: ['user-addresses', variables.user_id] });
            }
        },
    });
}

export function useUpdateAddress() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/update_user_address', data);
        },
        onSuccess: (_data, variables) => {
            if (variables.user_id) {
                queryClient.invalidateQueries({ queryKey: ['user-addresses', variables.user_id] });
            }
        },
    });
}

export function useDeleteAddress() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_address', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-addresses'] });
        },
    });
}

export function useCreateBanner() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: FormData) => {
            return POST('/upload_banner_image', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['banners'] });
        },
    });
}

export function useDeleteBanner() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_banner_image', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['banners'] });
        },
    });
}

export function useCreateTestimonial() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown> | FormData) => {
            return POST('/add_testimonial', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['testimonials'] });
        },
    });
}

export function useUpdateTestimonial() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown> | FormData) => {
            return POST('/update_testimonial', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['testimonials'] });
        },
    });
}

export function useDeleteTestimonial() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_testimonial', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['testimonials'] });
        },
    });
}

export function useCreatePincode() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_pincode', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pincodes'] });
        },
    });
}

export function useDeletePincode() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_pincode', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pincodes'] });
        },
    });
}

export function useCreateDeliveryLocation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_available_delivery_location', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['delivery-locations'] });
        },
    });
}

export function useDeleteDeliveryLocation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_available_delivery_location', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['delivery-locations'] });
        },
    });
}

export function useUpdateWebPage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/update_web_page', data);
        },
        onSuccess: (_data, variables) => {
            if (variables.page) {
                queryClient.invalidateQueries({ queryKey: ['web-page', variables.page] });
            }
        },
    });
}

export function useUpdateSettings() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/update_web_app_settings', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
    });
}

export function useUpdateInvoiceSettings() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/update_invoice_settings', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoice-settings'] });
        },
    });
}

export function useUpdatePaymentGateway() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/update_payment_getway', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payment-gateway'] });
        },
    });
}

export function useCreateSocialMedia() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_social_media', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['social-media'] });
        },
    });
}

export function useDeleteSocialMedia() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_social_media', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['social-media'] });
        },
    });
}

export function useCreateNotification() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_user_notification', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

export function useSendLowWalletNotification() {
    return useMutation({
        mutationFn: async () => {
            return POST('/send_low_wallet_notificaiton', {});
        },
    });
}

export function useUploadImage() {
    return useMutation({
        mutationFn: async (data: FormData) => {
            return POST<{ image: string }>('/upload_image_only', data);
        },
    });
}
