"use client";

import { useMemo } from "react";
import { useAdminUsers, type AdminUser } from "@/hooks/useAdminUsers";

/**
 * A WhatsApp-assignable agent — an admin-panel user who can be assigned
 * conversations. Sourced from the admin users (backend REST API), replacing
 * the legacy Supabase `public.users` table.
 *
 * `id` is the admin user's backend id (stringified) — the same value the
 * useAuth shim exposes as `user.id` (String(admin.id)), so "assign to me" and
 * the assigned-badge comparisons line up. It's stored verbatim in
 * conversations.assigned_to, with `name` denormalized into assigned_name.
 */
export interface AssignableUser {
    id: string;
    name: string;
    email?: string;
}

/**
 * True when an admin user can work WhatsApp conversations: they have the
 * `whatsapp` permission, or full access (a role with empty/missing
 * permissions — same rule as computePermissions in lib/auth.tsx).
 */
function userHasWhatsappAccess(user: AdminUser): boolean {
    const roles = user.role ?? [];
    if (roles.length === 0) return true; // no roles → full access (legacy super-admin)
    if (roles.some((r) => !r.permissions || r.permissions.length === 0)) return true;
    return roles.some((r) => (r.permissions ?? []).includes("whatsapp"));
}

export function useAssignableUsers() {
    const query = useAdminUsers();

    const users = useMemo<AssignableUser[]>(() => {
        return (query.data ?? [])
            .filter(userHasWhatsappAccess)
            .map((u) => ({
                id: String(u.user_id ?? u.id),
                name: u.name,
                email: u.email,
            }));
    }, [query.data]);

    return { ...query, users };
}
