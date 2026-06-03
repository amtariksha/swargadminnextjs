// Delivery-app capability catalog — shared by the Roles page (per-role caps,
// role.delivery_permissions) and the Admin Users page (per-user override,
// user.delivery_permissions). The backend UNIONs role caps + user caps to
// decide which pages the delivery app shows. Keys must stay in sync with the
// delivery app's capability checks.
export const DELIVERY_PERMISSIONS: { key: string; label: string; icon: string }[] = [
    // Last-mile / morning customer doorstep delivery (legacy role-4 screen).
    { key: 'milk-delivery', label: 'Milk Delivery (last-mile)', icon: '🥛' },
    // Truck route — drop-points + shops with mark-delivered (legacy role-5 screen).
    { key: 'truck-delivery', label: 'Truck Deliveries (drop points)', icon: '🚚' },
    { key: 'collection-pickup', label: 'Collection Pickup', icon: '🧺' },
    { key: 'production-supervisor', label: 'Production Supervisor', icon: '🏭' },
    { key: 'day-production-support', label: 'Day Production Support', icon: '🛠️' },
    // Lets a non-day-driver (e.g. a production supervisor) cover the day-time
    // delivery pool when the day driver is on leave.
    { key: 'day-delivery', label: 'Day Deliveries', icon: '🛵' },
];
