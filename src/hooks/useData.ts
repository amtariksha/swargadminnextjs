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
    title: string;
    photo: string;
    link?: string;
    status: number;
    created_at: string;
}

export function useBanners() {
    return useQuery({
        queryKey: ['banners'],
        queryFn: async () => {
            const response = await GET<Banner[]>('/get_banner');
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

// Pincodes
export interface Pincode {
    id: number;
    pincode: string;
    area?: string;
    city?: string;
    delivery_charge: number;
    status: number;
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

// Delivery Locations
export interface DeliveryLocation {
    id: number;
    name: string;
    address?: string;
    pincode?: string;
    status: number;
}

export function useDeliveryLocations() {
    return useQuery({
        queryKey: ['delivery-locations'],
        queryFn: async () => {
            const response = await GET<DeliveryLocation[]>('/get_delivery_location');
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
