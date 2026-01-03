import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';

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
    category_id: number;
    subcategory_id?: number;
    photo?: string;
    description?: string;
    price: number;
    discount_price?: number;
    unit: string;
    stock: number;
    status: number;
    created_at: string;
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
