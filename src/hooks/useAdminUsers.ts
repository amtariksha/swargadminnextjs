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
        /** Page permission keys for this role (matches AVAILABLE_PERMISSIONS in /roles). */
        permissions?: string[];
    }[];
}

// Role interface
export interface Role {
    id: number;
    title: string;
    permissions?: string[];
    created_at?: string;
}

/**
 * Fetch every admin user across every role.
 *
 * Previously hardcoded to roles 1/2/3 (Super Admin / Admin / Sub Admin),
 * which silently hid any user assigned to a custom role like "Driver" or
 * "Truck Driver" added via /roles. Now resolves the role list dynamically
 * via /get_roles, fans out a /get_user/role/{id} call per role, and
 * dedupes by id (a user can carry multiple roles).
 */
export function useAdminUsers() {
    return useQuery({
        queryKey: ['admin-users'],
        queryFn: async () => {
            const rolesRes = await GET<Role[]>('/get_roles');
            const roles = rolesRes.data || [];
            if (roles.length === 0) return [];

            const perRole = await Promise.all(
                roles.map((r) => GET<AdminUser[]>(`/get_user/role/${r.id}`))
            );

            // Flatten + dedupe by user_id (or id) — a user with two roles
            // appears in two responses; we keep the first occurrence and
            // rely on its `role` array to list all the assignments.
            const seen = new Set<number>();
            const out: AdminUser[] = [];
            for (const res of perRole) {
                for (const u of res.data || []) {
                    const key = u.user_id ?? u.id;
                    if (key == null || seen.has(key)) continue;
                    seen.add(key);
                    out.push(u);
                }
            }
            return out;
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
