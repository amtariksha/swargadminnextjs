/**
 * Role classification helpers — shared between the auth context (login
 * gate) and the /admin-users hook (list filter).
 *
 * Some roles in the swarg tenant are *not* meant to access the admin
 * panel at all. The "DRIVER" role is the obvious example: those users
 * are delivery drivers who authenticate through the Flutter delivery
 * app, never through admin.desicowmilk.com. Their credentials are
 * stored in the same `users` table the admin panel reads, so a stray
 * login attempt from the admin URL would normally succeed and surface
 * them in the admin-users list — both undesirable.
 *
 * We treat any role whose `role_title` is in DELIVERY_ONLY_ROLE_TITLES
 * (case-insensitive) as "delivery-app only". A user is admin-panel
 * eligible iff at least one of their roles is NOT in that set, i.e.
 * they hold a real admin role too.
 *
 * To extend (e.g. add another delivery-only role title), add the
 * lowercased title to the set below. No backend change required.
 */

const DELIVERY_ONLY_ROLE_TITLES = new Set<string>([
    'driver', // existing role used by the Flutter swargdeliveryapp users
]);

interface RoleLike {
    role_title?: string | null;
}

/**
 * True when the role is exclusively for the delivery Flutter app — i.e.
 * a holder of ONLY this role should not be allowed into the admin panel.
 */
export const isDeliveryOnlyRole = (role: RoleLike | undefined | null): boolean => {
    if (!role?.role_title) return false;
    return DELIVERY_ONLY_ROLE_TITLES.has(role.role_title.trim().toLowerCase());
};

interface UserWithRoles {
    role?: RoleLike[];
}

/**
 * True when the user has at least one role that is NOT delivery-only.
 * A user with no roles at all is treated as admin-panel eligible
 * (matches the existing "no roles → full access" semantics that exist
 * for legacy super-admin accounts pre-RBAC).
 */
export const userIsAdminPanelEligible = (user: UserWithRoles | null | undefined): boolean => {
    const roles = user?.role ?? [];
    if (roles.length === 0) return true;
    return roles.some((r) => !isDeliveryOnlyRole(r));
};
