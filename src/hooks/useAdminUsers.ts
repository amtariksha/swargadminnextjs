import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, POST, DELETE } from '@/lib/api';

// Admin User interface
export interface AdminUser {
    id: number;
    user_id: number;
    name: string;
    email: string;
    phone: string;
    photo?: string;
    status: number;
    created_at: string;
    role?: {
        id: number;
        role_id: number;
        role_title: string;
    }[];
}

// Role interface
export interface Role {
    id: number;
    title: string;
    permissions?: string[];
    created_at?: string;
}

// Fetch admin users (role 2 = Admin, role 3 = SubAdmin)
export function useAdminUsers() {
    return useQuery({
        queryKey: ['admin-users'],
        queryFn: async () => {
            // Fetch admins (role 2) and sub-admins (role 3)
            const [admins, subAdmins] = await Promise.all([
                GET<AdminUser[]>('/get_user/role/2'),
                GET<AdminUser[]>('/get_user/role/3'),
            ]);
            const combined = [...(admins.data || []), ...(subAdmins.data || [])];
            return combined;
        },
    });
}

// Fetch all roles
export function useRoles() {
    return useQuery({
        queryKey: ['roles'],
        queryFn: async () => {
            const response = await GET<Role[]>('/get_roles');
            return response.data || [];
        },
    });
}

// Create admin user mutation
export function useCreateAdminUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            name: string;
            email: string;
            phone: string;
            password: string;
            role_id: number;
        }) => {
            const response = await POST('/add_admin_user', data);
            return response;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
    });
}

// Update admin user mutation
export function useUpdateAdminUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            id: number;
            name?: string;
            email?: string;
            phone?: string;
            role_id?: number;
            status?: number;
        }) => {
            const response = await POST('/update_admin_user', data);
            return response;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
    });
}

// Delete admin user mutation
export function useDeleteAdminUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: number) => {
            const response = await DELETE(`/delete_admin_user/${id}`);
            return response;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
    });
}

// Create role mutation
export function useCreateRole() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            title: string;
            permissions?: string[];
        }) => {
            const response = await POST('/add_role', data);
            return response;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] });
        },
    });
}

// Update role mutation
export function useUpdateRole() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            id: number;
            title?: string;
            permissions?: string[];
        }) => {
            const response = await POST('/update_role', data);
            return response;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] });
        },
    });
}
