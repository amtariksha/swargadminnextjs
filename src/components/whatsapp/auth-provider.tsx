"use client";

/**
 * WACRM-shaped useAuth shim, backed by the admin panel's authoritative
 * useAuth from @/lib/auth. Components copied from WACRM import `useAuth`
 * from this module and read `user.{id, name, email, role, orgId}`. The
 * shim translates the admin panel's user object into that shape so the
 * components don't need rewriting. orgId comes from the public env var
 * `NEXT_PUBLIC_WACRM_ORG_ID` (mirror of the server-side WACRM_ORG_ID
 * used by middleware to scope Supabase queries).
 *
 * This file deliberately replaces WACRM's original auth-provider.tsx,
 * which spoke to /api/auth/{me,logout} — endpoints we removed during
 * the merge.
 */

import { useMemo } from "react";
import { useAuth as useAdminAuth } from "@/lib/auth";

interface WaUser {
    id: string;
    name: string;
    email: string;
    role: string;
    orgId: string;
}

interface WaAuthValue {
    user: WaUser | null;
    loading: boolean;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
}

export function useAuth(): WaAuthValue {
    const { admin, isLoading, hasFullAccess, logout: adminLogout } = useAdminAuth();

    const value = useMemo<WaAuthValue>(() => {
        const orgId = process.env.NEXT_PUBLIC_WACRM_ORG_ID || "";
        const user: WaUser | null = admin
            ? {
                id: String(admin.id),
                name: admin.email.split("@")[0],
                email: admin.email,
                // WACRM treats super_admin specially; map admin panel's
                // full-access flag (empty permissions array) to that role.
                role: hasFullAccess ? "super_admin" : "admin",
                orgId,
            }
            : null;
        return {
            user,
            loading: isLoading,
            logout: async () => adminLogout(),
            refresh: async () => {
                // The admin panel auth provider rehydrates from localStorage
                // on mount; nothing to do here.
            },
        };
    }, [admin, isLoading, hasFullAccess, adminLogout]);

    return value;
}

/**
 * No-op AuthProvider — kept as an export so any leftover
 * `<AuthProvider>...</AuthProvider>` usage from copied WACRM code
 * still compiles. The admin panel's real AuthProvider is mounted by
 * src/app/(dashboard)/layout.tsx.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
