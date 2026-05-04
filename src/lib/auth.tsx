'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { POST } from '@/lib/api';

/**
 * Permission key reserved for the driver-facing /production-delivery page.
 * If a user's role(s) carry ONLY this permission, they're treated as a
 * driver: post-login they land on /production-delivery and the dashboard
 * layout redirects them away from any /(dashboard)/* route. Granting this
 * alongside other permissions is allowed but won't change routing.
 */
export const PRODUCTION_DELIVERY_PERMISSION = 'production-delivery';

interface AdminRole {
    role_id?: number;
    role_title: string;
    /**
     * `permissions` is the JSON array stored on the role row by the
     * /roles admin UI. Empty array OR undefined means "full access"
     * (matches the existing semantics in src/app/(dashboard)/roles/page.tsx).
     */
    permissions?: string[];
}

interface AdminUser {
    id: number;
    email: string;
    role: AdminRole[];
    token: string;
}

interface AuthContextType {
    admin: AdminUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    /** Flat list of every permission across the user's roles. */
    permissions: string[];
    /** True when role.permissions is empty/missing on every role (full access). */
    hasFullAccess: boolean;
    /** True when permissions contains the given key OR the user has full access. */
    hasPermission: (key: string) => boolean;
    /**
     * True when the user has ONLY `production-delivery` (and no other
     * permission, and isn't full-access). Drives the post-login redirect
     * to /production-delivery and the dashboard-layout redirect away from
     * the regular admin pages.
     */
    isProductionDeliveryOnly: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const computePermissions = (admin: AdminUser | null) => {
    if (!admin?.role || admin.role.length === 0) {
        return { permissions: [], hasFullAccess: true };
    }
    // Role row may omit `permissions` entirely OR carry an empty array — both
    // mean full access (matches the comment in roles/page.tsx line 118).
    const anyFullAccess = admin.role.some(
        (r) => !r.permissions || r.permissions.length === 0
    );
    if (anyFullAccess) return { permissions: [], hasFullAccess: true };
    const set = new Set<string>();
    for (const r of admin.role) {
        for (const p of r.permissions ?? []) set.add(p);
    }
    return { permissions: Array.from(set), hasFullAccess: false };
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [admin, setAdmin] = useState<AdminUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    // Load admin from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('admin');
        if (stored) {
            try {
                setAdmin(JSON.parse(stored));
            } catch {
                localStorage.removeItem('admin');
            }
        }
        setIsLoading(false);
    }, []);

    const { permissions, hasFullAccess, isProductionDeliveryOnly } = useMemo(() => {
        const { permissions, hasFullAccess } = computePermissions(admin);
        const isProductionDeliveryOnly =
            !hasFullAccess &&
            permissions.length === 1 &&
            permissions[0] === PRODUCTION_DELIVERY_PERMISSION;
        return { permissions, hasFullAccess, isProductionDeliveryOnly };
    }, [admin]);

    const hasPermission = useCallback(
        (key: string) => hasFullAccess || permissions.includes(key),
        [hasFullAccess, permissions]
    );

    const login = useCallback(async (email: string, password: string) => {
        // Login API returns token at top level: { response: 200, data: {...user}, token: "JWT" }
        const response = await POST<AdminUser>('/login', { email, password }) as
            { data: AdminUser; message?: string; response?: number; token?: string };

        if (response.response === 200 && response.data) {
            const adminData = { ...response.data, token: response.token || '' };
            localStorage.setItem('admin', JSON.stringify(adminData));
            setAdmin(adminData);
            // Driver-only users land on /production-delivery; everyone else on /.
            const { permissions, hasFullAccess } = computePermissions(adminData);
            const driverOnly =
                !hasFullAccess &&
                permissions.length === 1 &&
                permissions[0] === PRODUCTION_DELIVERY_PERMISSION;
            router.push(driverOnly ? '/production-delivery' : '/');
        } else {
            throw new Error(response.message || 'Login failed');
        }
    }, [router]);

    const logout = useCallback(() => {
        localStorage.removeItem('admin');
        setAdmin(null);
        router.push('/login');
    }, [router]);

    return (
        <AuthContext.Provider
            value={{
                admin,
                isLoading,
                isAuthenticated: !!admin,
                permissions,
                hasFullAccess,
                hasPermission,
                isProductionDeliveryOnly,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
