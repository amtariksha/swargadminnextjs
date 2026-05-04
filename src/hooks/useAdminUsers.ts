import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, POST, DELETE } from '@/lib/api';

// Admin User interface
export interface AdminUser {
    id: number;
    user_id: number;
    name: string;
    email: string;
    phone: string;
    image?: string | null;
    created_at: string;
    updated_at?: string;
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

// Fetch admin users (role 1 = Super Admin, role 2 = Admin, role 3 = SubAdmin)
export function useAdminUsers() {
    return useQuery({
        queryKey: ['admin-users'],
        queryFn: async () => {
            // Fetch all admin types: Super Admin (1), Admin (2), Sub-Admin (3)
            const [superAdmins, admins, subAdmins] = await Promise.all([
                GET<AdminUser[]>('/get_user/role/1'),
                GET<AdminUser[]>('/get_user/role/2'),
                GET<AdminUser[]>('/get_user/role/3'),
            ]);
            const combined = [
                ...(superAdmins.data || []),
                ...(admins.data || []),
                ...(subAdmins.data || [])
            ];
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

// Create admin user mutation — uses /add_user with role
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
            const response = await POST('/add_user', {
                name: data.name,
                email: data.email,
                phone: data.phone,
                password: data.password,
                role: data.role_id,
            });
            return response;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
    });
}

// Update admin user mutation — uses /update_user
export function useUpdateAdminUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            id: number;
            name?: string;
            email?: string;
            phone?: string;
        }) => {
            const response = await POST('/update_user', data);
            return response;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
    });
}

// Reset admin user password — uses /reset_user_password.
// Backend hashes with bcrypt (12 rounds) and updates `users.password`.
// Mutation does NOT invalidate the admin-users list (no row data changes).
export function useResetAdminPassword() {
    return useMutation({
        mutationFn: async (data: { id: number; password: string }) => {
            const response = await POST('/reset_user_password', data);
            return response;
        },
    });
}

// Delete admin user mutation — uses /delete_user
export function useDeleteAdminUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: number) => {
            const response = await POST('/delete_user', { id });
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
