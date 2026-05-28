import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, POST, PUT, DELETE } from '@/lib/api';

// Users
export interface User {
    id: number;
    name: string;
    email: string;
    phone: string;
    image?: string | null;
    wallet_amount: number;
    created_at: string;
    updated_at: string;
    // Added by the backend (CTEs in getAllUsers). first_order_date is null
    // for users who have never placed an order; last_driver_id is the
    // users.id of the driver assigned to their most-recent order (null when
    // unassigned). Powers the /users driver filter + tenure columns.
    first_order_date?: string | null;
    last_driver_id?: number | null;
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
    user_id: number;
    name: string;
    email: string;
    phone: string;
    image?: string | null;
    is_location?: number;
    /** Wave-4 #7 — 0 (inactive) hides from every driver dropdown/payroll/
     *  assignment filter; only the /drivers page sees inactive rows. */
    is_active?: number;
    wallet_amount?: number;
    drop_point_id?: number | null;
    role_id?: number;
    role_label?: string;
    created_at: string;
    updated_at?: string;
}

// The three delivery roles a driver can hold. role 4 = last-mile delivery,
// role 5 = truck driver (Feature 03), role 6 = day driver (Feature 10).
export const DRIVER_ROLES: { id: number; label: string }[] = [
    { id: 4, label: 'Last-mile' },
    { id: 5, label: 'Truck' },
    { id: 6, label: 'Day' },
];

/**
 * Fetch every delivery driver across the three driver roles, tagged with
 * role.
 *
 * Wave-4 #7 — by default returns only `is_active = 1` drivers so every
 * dropdown / payroll / assignment screen hides retired drivers. The
 * /drivers page itself passes `{ includeInactive: true }` so the admin
 * can see and re-activate them.
 */
export function useDrivers(opts: { includeInactive?: boolean } = {}) {
    const includeInactive = opts.includeInactive === true;
    return useQuery({
        queryKey: ['drivers', includeInactive ? 'all' : 'active'],
        queryFn: async () => {
            const params = includeInactive ? { include_inactive: '1' } : undefined;
            const results = await Promise.allSettled(
                DRIVER_ROLES.map(async ({ id, label }) => {
                    const response = await GET<Driver[]>(`/get_user/role/${id}`, params);
                    return (response.data || []).map((d) => ({
                        ...d,
                        role_id: id,
                        role_label: label,
                    }));
                }),
            );
            const drivers: Driver[] = [];
            for (const r of results) {
                if (r.status === 'fulfilled') drivers.push(...r.value);
            }
            return drivers;
        },
    });
}

// Drop Points (Feature 03 — truck-driver mode)
export interface DropPointPhoto {
    id: number;
    image_path: string;
}

export interface DropPoint {
    id: number;
    title: string;
    lat: number | null;
    lng: number | null;
    route_order: number;
    notes: string | null;
    photos: DropPointPhoto[];
    driver_count: number;
    created_at?: string;
    updated_at?: string;
}

export function useDropPoints() {
    return useQuery({
        queryKey: ['drop-points'],
        queryFn: async () => {
            const response = await GET<DropPoint[]>('/drop_points');
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
    // Feature 16 — manufactured-product linkage (null for bought-and-resold SKUs).
    source_intermediate_id?: number | null;
    pack_volume?: number | null;
    // Feature 07 — returnable packaging linkage.
    is_returnable_packaging?: number;
    packaging_type_id?: number | null;
    // Feature 17 — back order: orderable at zero stock with a tentative date.
    allow_back_order?: number;
    back_order_next_available?: string | null;
    // Variations (migration 030). product_type drives whether the variant
    // table is read for purchasable units; stock_managed_at decides if
    // inventory is per-variant or a single parent pool. cost_price feeds
    // future margin reports + the procurement feeder.
    product_type?: 'simple' | 'variable';
    stock_managed_at?: 'variant' | 'parent';
    cost_price?: number | null;
    // Feature 10 — 1=morning_only, 2=day_only, 3=both.
    delivery_window?: number;
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

// Testimonials — field names match backend (title, sub_title, description, image)
export interface Testimonial {
    id: number;
    title: string;
    sub_title: string;
    description: string;
    rating: number;
    image?: string;
    image_id?: number;
    status?: number;
    updated_at?: string;
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
    location: string;
    title?: string; // alias
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
    setting_id?: number;
    /**
     * Lookup key for an app_settings row. The DB column is `title` — the
     * legacy admin code referred to it as `key`. Both names are exposed
     * for backwards compat; new callers should use `title`.
     */
    title: string;
    /** @deprecated alias of `title` — kept for legacy callers. */
    key?: string;
    value: string;
    type?: string;
}

export function useSettings() {
    return useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            // Backend mounts the route at /get_settings (plural). The legacy
            // /get_setting (singular) was a typo and 404s.
            const response = await GET<Settings[]>('/get_settings');
            return response.data || [];
        },
    });
}

/**
 * Resolve a single app_settings row to its truthy/falsy value. Treats
 * the row's `value` as truthy when it equals '1', 'true', or 'on'
 * (case-insensitive). Returns `defaultValue` when the row is missing or
 * while the query is still loading — UI components can default to
 * "feature hidden" or "feature visible" depending on their preference.
 *
 * The lookup key is `app_settings.title` — see migration files
 * 017/025/etc. for the seed pattern.
 *
 * Used by the variations rollout gate (`enable_variations`) to flip
 * Attributes / Variations menu items on per-tenant.
 */
export function useFeatureFlag(title: string, defaultValue = false): boolean {
    const { data: settings = [] } = useSettings();
    const row = settings.find((s) => s.title === title || s.key === title);
    if (!row) return defaultValue;
    const raw = String(row.value ?? '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

// ==========================================
// Extended Interfaces
// ==========================================

export interface UserDetail extends User {
    address?: string;
    pincode?: string;
    flat_no?: string;
    apartment_name?: string;
    area?: string;
    city?: string;
    landmark?: string;
    lat?: string;
    lng?: string;
    role?: Array<{ id: number; role_id: number; role_title: string }>;
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
    // Feature 14 — refund linkage / driver billing
    refund_for_transaction_id?: number | null;
    delivery_date?: string | null;
    refund_reason?: string | null;
    billed_to_driver?: number;
    billed_driver_id?: number | null;
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

export function useUserOrders(userId: number | string | undefined, enabled = true) {
    return useQuery({
        queryKey: ['user-orders', userId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await GET<any[]>(`/get_order/user/${userId}?limit=50`);
            return response.data || [];
        },
        enabled: !!userId && enabled,
    });
}

export function useUserTransactions(userId: number | string | undefined, enabled = true) {
    return useQuery({
        queryKey: ['user-transactions', userId],
        queryFn: async () => {
            const response = await GET<UserTransaction[]>(`/txn/user/${userId}?limit=50`);
            return response.data || [];
        },
        enabled: !!userId && enabled,
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

export function useUserDeliveryHistory(userId: number | string | undefined, enabled = true) {
    return useQuery({
        queryKey: ['user-delivery-history', userId],
        queryFn: async () => {
            const response = await GET<import('./useOrders').DeliveryReportItem[]>(
                `/get_sub_order_delivery_by_user/${userId}?limit=50`
            );
            return response.data || [];
        },
        enabled: !!userId && enabled,
    });
}

// Returns actual subscribed_order_delivery records for a user on a specific date
export function useUserCalendar(userId: number | string | undefined, date: string, enabled = true) {
    return useQuery({
        queryKey: ['user-calendar', userId, date],
        queryFn: async () => {
            const response = await GET<Record<string, unknown>[]>(`/get_order_delivered/${userId}/${date}`);
            return response.data || [];
        },
        enabled: !!userId && !!date && enabled,
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
            // The product page reads `id` as a string from useParams<{id:string}>,
            // so useProduct(id) caches under ['product', '157']. The mutation
            // payload coerces with Number(id) — invalidating ['product', 157]
            // (number) silently misses the string key, so reopening the
            // product served stale data and the form rendered the old values
            // (e.g. returnable packaging reverting to unchecked).
            // Invalidate by predicate so both number and string ids match.
            const rawId = variables instanceof FormData ? variables.get('id') : variables.id;
            if (rawId != null) {
                const idStr = String(rawId);
                queryClient.invalidateQueries({
                    predicate: (q) =>
                        q.queryKey[0] === 'product' &&
                        q.queryKey[1] != null &&
                        String(q.queryKey[1]) === idStr,
                });
            }
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
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            // Invalidate product detail cache - match both string and number key variants
            const pid = variables.product_id;
            if (pid) {
                queryClient.invalidateQueries({ queryKey: ['product', String(pid)] });
                queryClient.invalidateQueries({ queryKey: ['product', Number(pid)] });
            }
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

export function useDeleteCategoryImage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/cat/delete_image', data);
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

export function useDeleteSubcategoryImage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/sub_cat/delete_image', data);
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

// ==========================================
// CRM — Customer Feedback (Feature 13)
// ==========================================

export type ActivityWindows = Record<string, 'active' | 'inactive'>;

export interface CustomerFeedback {
    id: number;
    user_id: number;
    caller_user_id: number | null;
    call_type: 'feedback' | 'reactivation';
    calling_date: string | null;
    status: string | null;
    followup_date: string | null;
    occupation: string | null;
    preferred_call_time: string | null;
    problems: string | null;
    product_feedback: string | null;
    delivery_feedback: string | null;
    preferred_delivery_time: string | null;
    ring_bell_pref: string | null;
    drop_place_pref: string | null;
    application_feedback: string | null;
    customer_care_notes: string | null;
    created_at: string;
    updated_at: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    caller_name?: string | null;
}

export interface CustomerContext {
    user_id: number;
    name: string;
    phone: string;
    wallet_amount: number;
    route: string | null;
    driver_user_id: number | null;
    activity_windows: ActivityWindows;
    last_delivery_date: string | null;
    days_since_last_delivery: number | null;
    last_call: {
        id: number;
        calling_date: string | null;
        status: string | null;
        call_type: string;
        caller_name: string | null;
    } | null;
}

export interface WorklistItem {
    user_id: number;
    customer_name: string;
    phone: string;
    wallet_amount: number;
    reason: 'followup_due' | 'due_for_call';
    last_call_date: string | null;
    followup_date: string | null;
    route: string | null;
    activity_windows: ActivityWindows | null;
    days_since_last_delivery: number | null;
}

export interface WorklistDiagnostics {
    recent_activity_days: number;
    active_customers_last_30d: number;
    done_calls_in_cadence: number;
    followups_due: number;
}

export interface Worklist {
    cadence_days: number;
    count: number;
    items: WorklistItem[];
    diagnostics?: WorklistDiagnostics;
}

export interface CallScript {
    id: number;
    script_type: 'feedback' | 'reactivation';
    title: string;
    body: string;
    is_active: number;
    updated_by_user_id: number | null;
    created_at: string;
    updated_at: string;
}

export interface FeedbackListFilters {
    user_id?: number | string;
    caller_user_id?: number | string;
    status?: string;
    call_type?: string;
    from_date?: string;
    to_date?: string;
}

export function useCustomerFeedback(userId: number | string | undefined, enabled = true) {
    return useQuery({
        queryKey: ['customer-feedback', userId],
        queryFn: async () => {
            const response = await GET<CustomerFeedback[]>(`/crm/feedback/user/${userId}`);
            return response.data || [];
        },
        enabled: !!userId && enabled,
    });
}

export function useFeedbackList(filters: FeedbackListFilters = {}) {
    return useQuery({
        queryKey: ['feedback-list', filters],
        queryFn: async () => {
            const params: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(filters)) {
                if (value !== undefined && value !== '' && value !== null) params[key] = value;
            }
            const response = await GET<CustomerFeedback[]>('/crm/feedback', params);
            return response.data || [];
        },
    });
}

export function useFeedbackEntry(id: number | string | undefined, enabled = true) {
    return useQuery({
        queryKey: ['feedback-entry', id],
        queryFn: async () => {
            const response = await GET<CustomerFeedback>(`/crm/feedback/${id}`);
            return response.data;
        },
        enabled: !!id && enabled,
    });
}

export function useFeedbackWorklist() {
    return useQuery({
        queryKey: ['feedback-worklist'],
        queryFn: async () => {
            const response = await GET<Worklist>('/crm/worklist');
            return response.data;
        },
    });
}

// ─── Automation run history ──────────────────────────────────────────
//
// /settings/automation/runs reads from `automation_run` table — one row
// per fire of a timed cron job. `summary` is JSONB; the page renders
// it per-job (low-balance shows swept/notified, generate-delivery-list
// shows inserted/skipped, etc).

export interface AutomationRun {
    id: number;
    job_name: string;
    started_at: string;
    finished_at: string | null;
    status: 'ok' | 'failed';
    summary: Record<string, unknown> | null;
    error: string | null;
    duration_ms: number | null;
}

export interface AutomationRunSummary {
    job_name: string;
    total_runs: number;
    ok_runs: number;
    failed_runs: number;
    avg_duration_ms: number | null;
    last_run_at: string | null;
}

export function useAutomationRuns(filters: { job?: string; status?: string; limit?: number } = {}) {
    const params: Record<string, string> = {};
    if (filters.job) params.job = filters.job;
    if (filters.status) params.status = filters.status;
    if (filters.limit) params.limit = String(filters.limit);
    return useQuery({
        queryKey: ['automation-runs', filters],
        queryFn: async () => {
            const response = await GET<AutomationRun[]>('/automation/runs', params);
            return response.data || [];
        },
    });
}

export function useAutomationRunsSummary() {
    return useQuery({
        queryKey: ['automation-runs-summary'],
        queryFn: async () => {
            const response = await GET<AutomationRunSummary[]>('/automation/runs/summary');
            return response.data || [];
        },
    });
}

export function useCustomerContext(userId: number | string | undefined, enabled = true) {
    return useQuery({
        queryKey: ['customer-context', userId],
        queryFn: async () => {
            const response = await GET<CustomerContext>(`/crm/customer-context/${userId}`);
            return response.data;
        },
        enabled: !!userId && enabled,
    });
}

export function useCallScripts() {
    return useQuery({
        queryKey: ['call-scripts'],
        queryFn: async () => {
            const response = await GET<CallScript[]>('/crm/scripts');
            return response.data || [];
        },
    });
}

export function useCallScript(type: 'feedback' | 'reactivation', enabled = true) {
    return useQuery({
        queryKey: ['call-script', type],
        queryFn: async () => {
            const response = await GET<CallScript>(`/crm/scripts/${type}`);
            return response.data;
        },
        enabled: !!type && enabled,
    });
}

export function useCreateFeedback() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST<CustomerFeedback>('/crm/feedback', data);
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['customer-feedback', variables.user_id] });
            queryClient.invalidateQueries({ queryKey: ['feedback-list'] });
            queryClient.invalidateQueries({ queryKey: ['feedback-worklist'] });
            queryClient.invalidateQueries({ queryKey: ['customer-context', variables.user_id] });
        },
    });
}

export function useUpdateFeedback() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: Record<string, unknown> & { id: number | string }) => {
            return PUT<CustomerFeedback>(`/crm/feedback/${id}`, data);
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['customer-feedback'] });
            queryClient.invalidateQueries({ queryKey: ['feedback-list'] });
            queryClient.invalidateQueries({ queryKey: ['feedback-worklist'] });
            queryClient.invalidateQueries({ queryKey: ['feedback-entry', variables.id] });
        },
    });
}

export function useUpdateCallScript() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: Record<string, unknown> & { id: number | string }) => {
            return PUT<CallScript>(`/crm/scripts/${id}`, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['call-scripts'] });
            queryClient.invalidateQueries({ queryKey: ['call-script'] });
        },
    });
}

// ==========================================
// Feature 14 — Refund management
// ==========================================

export interface RefundReason {
    label: string;
    active: boolean;
}

export interface RefundDriver {
    id: number;
    name: string;
}

export interface RefundOrderContext {
    transaction_id: number;
    is_debit: boolean;
    amount: number;
    order_id: number | null;
    delivery_date: string | null;
    already_refunded: boolean;
    assigned_driver: RefundDriver | null;
    driver_candidates: RefundDriver[];
}

export interface RefundReportReasonRow { reason: string; count: number; amount: number; }
export interface RefundReportDriverRow { driver_id: number | null; driver_name: string; count: number; amount: number; }
export interface RefundReportDateRow { date: string | null; count: number; amount: number; }

export interface RefundReport {
    range: { from: string; to: string };
    summary: { total_count: number; total_amount: number; billed_amount: number; absorbed_amount: number };
    by_reason: RefundReportReasonRow[];
    by_driver: RefundReportDriverRow[];
    by_date: RefundReportDateRow[];
}

export function useRefundReasons(activeOnly = false) {
    return useQuery({
        queryKey: ['refund-reasons', activeOnly],
        queryFn: async () => {
            const response = await GET<RefundReason[]>(`/refund/reasons${activeOnly ? '?active=1' : ''}`);
            return response.data || [];
        },
    });
}

export function useUpdateRefundReasons() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (reasons: RefundReason[]) => {
            return PUT<RefundReason[]>('/refund/reasons', { reasons });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['refund-reasons'] });
        },
    });
}

export function useRefundOrderContext(transactionId: number | null | undefined) {
    return useQuery({
        queryKey: ['refund-order-context', transactionId],
        queryFn: async () => {
            const response = await GET<RefundOrderContext>(`/refund/order-context/${transactionId}`);
            return response.data;
        },
        enabled: !!transactionId,
    });
}

export function useProcessRefund() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/refund', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['transactions-range'] });
            queryClient.invalidateQueries({ queryKey: ['user-transactions'] });
            queryClient.invalidateQueries({ queryKey: ['user'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['refund-report'] });
        },
    });
}

export function useRefundReport(from: string, to: string) {
    return useQuery({
        queryKey: ['refund-report', from, to],
        queryFn: async () => {
            const response = await GET<RefundReport>(`/refund/report?from=${from}&to=${to}`);
            return response.data;
        },
        enabled: !!from && !!to,
    });
}

// ==========================================
// Feature 15 — Driver payroll
// ==========================================

export interface PayslipRow {
    driver_id: number;
    driver_name: string;
    email: string | null;
    has_master: boolean;
    master_active: boolean;
    designation: string | null;
    payslip_id: number | null;
    status: string | null; // 'generated' | 'draft' | null
    total_earning: number | null;
    total_deduction: number | null;
    net_pay: number | null;
    billed_deductions: number | null;
    pdf_url: string | null;
    prorated: boolean;
    generated_at: string | null;
    basic_paid: number | null;
    hra_paid: number | null;
    medical_allowance: number | null;
    special_allowance: number | null;
    travel_allowance: number | null;
    bonus: number | null;
    reimbursement: number | null;
    pf: number | null;
    esi: number | null;
    pt: number | null;
    tax: number | null;
    misc: number | null;
}

export interface PayslipsResponse {
    period: { month: number; year: number; label: string };
    rows: PayslipRow[];
}

export interface SalaryMaster {
    id?: number;
    driver_id: number;
    designation?: string | null;
    joining_date?: string | null;
    bank_name?: string | null;
    account_holder_name?: string | null;
    account_no?: string | null;
    ifsc?: string | null;
    pan?: string | null;
    uan?: string | null;
    basic?: number;
    hra?: number;
    medical_allowance?: number;
    special_allowance?: number;
    travel_allowance?: number;
    reimbursement_base?: number;
    bonus_base?: number;
    pf_deduction?: number;
    esi_deduction?: number;
    pt_deduction?: number;
    tax_deduction?: number;
    misc_deduction?: number;
    is_active?: number;
    ref_no?: string | null;
}

export interface GeneratePayslipsResult {
    generated: number;
    skipped: string[];
    warnings: string[];
}

export function usePayslips(month: number, year: number) {
    return useQuery({
        queryKey: ['payslips', month, year],
        queryFn: async () => {
            const response = await GET<PayslipsResponse>(`/payroll/payslips?month=${month}&year=${year}`);
            return response.data;
        },
        enabled: !!month && !!year,
    });
}

export function useSalaryMaster(driverId: number | null) {
    return useQuery({
        queryKey: ['salary-master', driverId],
        queryFn: async () => {
            const response = await GET<SalaryMaster | null>(`/payroll/master/${driverId}`);
            return response.data;
        },
        enabled: !!driverId,
    });
}

export function useSaveSalaryMaster() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => POST('/payroll/master', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['salary-master'] });
            queryClient.invalidateQueries({ queryKey: ['payslips'] });
        },
    });
}

export function useGeneratePayslips() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) =>
            POST<GeneratePayslipsResult>('/payroll/generate', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payslips'] }),
    });
}

export function useUpdatePayslip() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: { id: number } & Record<string, unknown>) =>
            PUT(`/payroll/payslip/${id}`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payslips'] }),
    });
}

export function useAddDriverDeduction() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => POST('/payroll/deduction', data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payslips'] }),
    });
}

export function useEmailPayslip() {
    return useMutation({
        mutationFn: async (id: number) => POST(`/payroll/payslip/${id}/email`, {}),
    });
}

// ==========================================
// Feature 07 — Returnable packaging
// ==========================================

export interface PackagingType {
    id: number;
    name: string;
    refund_amount: number;
    is_active: number;
    created_at: string;
    updated_at: string;
}

export type RefundMode = 'auto' | 'manual';

export type ReturnStatus =
    | 'requested'
    | 'picked_up_last_mile'
    | 'picked_up_truck'
    | 'pending_approval'
    | 'refunded'
    | 'cancelled';

export interface PackagingReturn {
    id: number;
    user_id: number;
    packaging_type_id: number;
    packaging_type_name: string;
    qty: number;
    status: ReturnStatus;
    origin: string;
    product_id: number | null;
    requested_at: string | null;
    pickup_date: string | null;
    last_mile_pickup_at: string | null;
    pickup_photo_url: string | null;
    drop_point_id: number | null;
    truck_pickup_at: string | null;
    refund_amount: number | null;
    refunded_at: string | null;
    customer_name: string | null;
    customer_phone: string | null;
}

export interface ReturnsResponse {
    rows: PackagingReturn[];
    refund_mode: RefundMode;
}

export function usePackagingTypes(activeOnly = false) {
    return useQuery({
        queryKey: ['packaging-types', activeOnly],
        queryFn: async () => {
            const response = await GET<PackagingType[]>(
                `/get_packaging_types${activeOnly ? '?active=1' : ''}`
            );
            return response.data || [];
        },
    });
}

export function useCreatePackagingType() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/add_packaging_type', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packaging-types'] });
        },
    });
}

export function useUpdatePackagingType() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/update_packaging_type', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packaging-types'] });
        },
    });
}

export function useDeletePackagingType() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST('/delete_packaging_type', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packaging-types'] });
        },
    });
}

export function useReturns(status?: string) {
    return useQuery({
        queryKey: ['packaging-returns', status ?? ''],
        queryFn: async () => {
            const response = await GET<PackagingReturn[]>(
                `/packaging/returns${status ? `?status=${status}` : ''}`
            );
            // The endpoint returns { data: [...], refund_mode } — `data` is the
            // row array, refund_mode rides alongside on the envelope.
            const envelope = response as { data: PackagingReturn[]; refund_mode?: RefundMode };
            return {
                rows: envelope.data || [],
                refund_mode: envelope.refund_mode ?? 'manual',
            } as ReturnsResponse;
        },
    });
}

export function useApproveReturn() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return POST<{ refund_amount: number; new_wallet_balance: number }>(
                '/packaging/returns/approve',
                data
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packaging-returns'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
        },
    });
}

export function useRefundMode() {
    return useQuery({
        queryKey: ['packaging-refund-mode'],
        queryFn: async () => {
            const response = await GET<{ mode: RefundMode }>('/packaging/refund_mode');
            return response.data?.mode ?? 'manual';
        },
    });
}

export function useSetRefundMode() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (mode: RefundMode) => {
            return POST('/packaging/refund_mode', { mode });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packaging-refund-mode'] });
            queryClient.invalidateQueries({ queryKey: ['packaging-returns'] });
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Feature 10 — Day-time delivery network
// ─────────────────────────────────────────────────────────────────────────

export interface DaytimeOrderItem {
    id?: number;
    product_id: number;
    product_title?: string;
    qty: number;
    unit_price: number;
    is_bulk_rate: boolean;
    line_total: number;
}

export interface DaytimeOrder {
    id: number;
    order_no: number;
    user_id: number;
    customer_name: string;
    customer_phone: string;
    created_by_user_id: number;
    created_by_name?: string;
    delivery_address?: string | null;
    delivery_lat?: number | null;
    delivery_lng?: number | null;
    delivery_date: string;
    entry_type?: string | null;
    subtotal: number;
    discount_flat: number;
    discount_reason?: string | null;
    shipping_charges: number;
    total_amount: number;
    additional_instructions?: string | null;
    order_status: 'pending' | 'confirmed' | 'cancelled' | 'delivered';
    payment_status: 'unpaid' | 'link_sent' | 'paid' | 'cash' | 'wallet_deducted';
    payment_mode?: string | null;
    payment_link_id?: string | null;
    payment_short_url?: string | null;
    razorpay_payment_id?: string | null;
    paid_at?: string | null;
    created_at?: string;
    updated_at?: string;
    items: DaytimeOrderItem[];
    delivery?: {
        id: number;
        status: string;
        claimed_by_user_id?: number | null;
        claimed_at?: string | null;
        delivered_at?: string | null;
        delivered_qty?: number | null;
    } | null;
}

export interface DaytimeProduct {
    id: number;
    title: string;
    qty_text?: string;
    price: number;
    mrp: number;
    delivery_window: number;
}

export interface SalesIncentiveRow {
    id: number;
    sales_exec_user_id: number;
    exec_name?: string;
    incentive_date: string;
    orders_count: number;
    new_customers_count: number;
    sales_value: number;
    incentive_amount: number;
    formula_snapshot?: unknown;
}

export interface DaytimeSalesReport {
    from: string;
    to: string;
    summary: {
        total_orders: number;
        paid_orders: number;
        paid_revenue: number;
        unpaid_orders: number;
    };
    payment_breakdown: { payment_status: string; count: number; total: number }[];
    per_exec: {
        exec_id: number;
        exec_name?: string;
        orders_count: number;
        paid_sales: number;
        total_sales: number;
    }[];
}

export function useDaytimeOrders(filters: Record<string, string> = {}) {
    return useQuery({
        queryKey: ['daytime-orders', filters],
        queryFn: async () => {
            const response = await GET<DaytimeOrder[]>('/daytime/orders', filters);
            return response.data || [];
        },
    });
}

export function useDaytimeOrder(id: number | string | undefined) {
    return useQuery({
        queryKey: ['daytime-order', id],
        queryFn: async () => {
            const response = await GET<DaytimeOrder>(`/daytime/orders/${id}`);
            return response.data;
        },
        enabled: id !== undefined && id !== '',
    });
}

export function useDaytimeProducts() {
    return useQuery({
        queryKey: ['daytime-products'],
        queryFn: async () => {
            const response = await GET<DaytimeProduct[]>('/daytime/products');
            return response.data || [];
        },
    });
}

export function useDaytimeSalesReport(filters: Record<string, string> = {}) {
    return useQuery({
        queryKey: ['daytime-sales-report', filters],
        queryFn: async () => {
            const response = await GET<DaytimeSalesReport>('/daytime/sales_report', filters);
            return response.data;
        },
    });
}

export function useDaytimeIncentives(filters: Record<string, string> = {}) {
    return useQuery({
        queryKey: ['daytime-incentives', filters],
        queryFn: async () => {
            const response = await GET<{ from: string; to: string; total_incentive: number; incentives: SalesIncentiveRow[] }>(
                '/daytime/incentives', filters,
            );
            return response.data;
        },
    });
}
