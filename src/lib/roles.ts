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

/**
 * Seeded delivery-only role ids: 4 = last-mile, 5 = truck, 6 = day driver.
 * Mirrors the backend's src/middleware/driverWall.js — keep the two in sync.
 */
export const DELIVERY_ONLY_ROLE_IDS = new Set<number>([4, 5, 6]);

/**
 * Custom delivery-only roles created via /roles match by title: any flavour of
 * "driver" (Day Driver, Last-mile Driver, Truck Driver, Collection Driver, the
 * legacy bare "DRIVER") plus Production Supervisor.
 */
export const DELIVERY_ONLY_TITLE_REGEX = /driver|production supervisor/i;

interface RoleLike {
    role_id?: number | string | null;
    role_title?: string | null;
}

/**
 * True when the role is exclusively for the delivery Flutter app — i.e.
 * a holder of ONLY this role should not be allowed into the admin panel.
 */
export const isDeliveryOnlyRole = (role: RoleLike | undefined | null): boolean => {
    if (!role) return false;
    const id = Number(role.role_id);
    if (Number.isFinite(id) && DELIVERY_ONLY_ROLE_IDS.has(id)) return true;
    if (!role.role_title) return false;
    return DELIVERY_ONLY_TITLE_REGEX.test(role.role_title);
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
